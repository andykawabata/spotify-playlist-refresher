require('dotenv').config()
const fetch = require("node-fetch");
const express = require('express')
const request = require('request');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const { response } = require('express');
const app = express()
app.use(cookieParser());
app.set('view engine', 'ejs');
let port = process.env.PORT;
if (port == null || port == "") {
  port = 8080;
}
app.listen(port);
app.use(express.static(__dirname + '/public'));


const client_id = process.env.CLIENT_ID
const redirect_uri = process.env.REDIRECT_URI
const client_secret = process.env.CLIENT_SECRET

const defaultImage ='https://lh3.googleusercontent.com/proxy/Co6vin71JdxWa7TDrq2a1mu7h0-teMN4TZboKFw5maqWEYuk-H0PWSLQRU3CUXLYNNB2D6yKBL9N0RCACnAdSG6xleui-MEjfGnG11S41JYBFZFle3DVSVxzRvdTvsttStjhdg'


app.get('/', function(req, res) {
  let refresh_token = req.cookies.refresh_token;
  let access_token = req.cookies.access_token;
  if(!(refresh_token && access_token))
    res.render('landing');
  else
    res.redirect('/home');
});




app.get('/login', function(req, res) {
  var scopes = 'playlist-read-private playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
  querystring.stringify({
    response_type: 'code',
    client_id: client_id,
    scope: scopes,
    redirect_uri: redirect_uri,
    show_dialog: true
  }));
});














//if user does not accept, there will be 'error' param in query string instead of 'code'
app.get('/callback', async (req, res) => {
  if(req.query.error)
    return res.send("Whoops! looks like there was a problem with your login. " )
  var code = req.query.code || null;



  var url = 'https://accounts.spotify.com/api/token?code='+code+'&redirect_uri='+redirect_uri+'&grant_type=authorization_code';
  var headers = {'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')),
                  'Content-Type':'application/x-www-form-urlencoded'}
  var options = { method : 'POST',
                  headers: headers
  }
  
  fetch(url, options)
  .then(response => response.json())
  .then(json => {
      var access_token = json.access_token;
      var refresh_token = json.refresh_token;
      var url = 'https://api.spotify.com/v1/me'
      var options = {
        headers: { 'Authorization': 'Bearer ' + access_token }
      };
      fetch(url, options)
      .then(response => response.json())
      .then(json => {
        var userId = json.id
        var name = json.display_name
        res.cookie('access_token', access_token, {expires: new Date(Date.now() + 1000*20)})
        res.cookie('refresh_token', refresh_token)
        res.cookie('userId', userId)
        res.cookie('name', name)
        return res.redirect('/home')
        
      })
  }).catch(err => res.status(500).end())
});













//navigate to for first time - no access token
//navigate to again - valid access token
//navigate to again - expired access token 
app.get('/home', async function(req, res){
  let refresh_token = req.cookies.refresh_token;
  let access_token = req.cookies.access_token;
  let name = req.cookies.name;
  let userId = req.cookies.userId
  if(!refresh_token){//access token expired or doesn't exist (better if expired access token just requested new one?)
    return res.redirect('/login');
}
  if(!access_token){
    console.log("IF 2")
    access_token = await getNewAccessToken(refresh_token);
    res.cookie('access_token', access_token, {expires: new Date(Date.now() + 1000*60*59)})
  }
  let url = 'https://api.spotify.com/v1/users/'+userId+'/playlists'
  var options = {
    headers: { 'Authorization': 'Bearer ' + access_token }
  };

  try{
    var response = await fetch(url, options)
    var json = await response.json()
    var playlistsArray  = json.items
    console.log(playlistsArray[1].images)
    var filteredPlaylistArray = []
    playlistsArray.forEach(playlist => {
      var name = playlist.name.replace(/'/g, '').replace(/"/g, '')
      var id = playlist.id
      var img = playlist.images[0] ? playlist.images[0].url : defaultImage
      var numTracks = playlist.tracks.total
      filteredPlaylistArray.push({name: name, id: id, img: img, numTracks: numTracks})
    });

    return res.render('home', {playlists: filteredPlaylistArray, name: name})
  }
  catch{
    return res.status(500).end();
  }
})












app.get('/refresh', async function(req, res){
  let userId = req.cookies.userId
  let playlistId = req.query.id;
  let playlistName = req.query.name;
  let access_token = req.cookies.access_token;
  let refresh_token = req.cookies.refresh_token;

  if(!refresh_token)// if no refresh token
    res.redirect('/login')
  if(!access_token){//if access_token is expired
    access_token = await getNewAccessToken(refresh_token);
    if(!access_token){ //if token  couldn't be succesfully refreshed, redo entire flow
      res.redirect('/login')
    }
    res.cookie('access_token', access_token, {expires: new Date(Date.now() + 1000*60*59)})// else, add new access token to cookie
  }


  //get artist/track list from playlist id
  let params = "?fields=tracks.items(track(name,href,artists,album(name,href)))"
  let url = 'https://api.spotify.com/v1/playlists/' + playlistId + params
  let options = {
    headers: { 'Authorization': 'Bearer ' + access_token }
  };
  try{
    var response = await fetch(url, options);
    var json  = await response.json();
    if(!response.ok)
      throw new Error("err");
  }
  catch{
    return res.status(500).send("Server Error");
  }
  let tracks = json.tracks.items
  let artistTrackArray = []
    tracks.forEach(item => {                   //extract artist id and track id of each track
      let artistId = item.track.artists[0].id;
      let trackId = item.track.id
      artistTrackArray.push({artistId: artistId, trackId: trackId})
    })
  let newTrackList = await createNewTrackList(artistTrackArray, res);
  if(newTrackList === -1)
    return res.status(500).send("Server Error");




  //create new empty playlist
  let newPlaylistName = playlistName + ' - REFRESHED'
  url = 'https://api.spotify.com/v1/users/'+userId+'/playlists'
  let bodyParams = {
    name: newPlaylistName
  }
  let bodyString = JSON.stringify(bodyParams);
  options = {
    method: 'POST',
    body: bodyString,
    headers: { 
      'Authorization': 'Bearer ' + access_token,
      'Content-type': 'application/json' 
    }
  };
  try{
    response = await fetch(url, options); 
    json = await response.json();
    if(!response.ok)
      throw new Error("err");
  }catch{
    return res.status(500).send("Server Error")
  }
  let newPlaylistId = json.id;



  //add tracks to newly created playlist
  url = 'https://api.spotify.com/v1/playlists/'+newPlaylistId+'/tracks';
  //bodyParameterExample = {"uris": ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh","spotify:track:1301WleyT98MSxVHPZCA6M", "spotify:episode:512ojhOuo1ktJprKbVcKyQ"]}
  formattedTrackList = createFormattedTrackList(newTrackList);
  bodyParams = {"uris": formattedTrackList}
  bodyString = JSON.stringify(bodyParams);
  options = {
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + access_token,
      'Content-type': 'application/json' 
    },
    body: bodyString
  };
  try{
    response = await fetch(url, options); 
    json = await response.json();
    if(!response.ok)
      throw new Error("err");
  }catch{
    return res.status(500).send("Server Error")
  }
  let newPlaylistInfo = json;
  
  //get new playlist img, tracks, length

  url = 'https://api.spotify.com/v1/playlists/' + newPlaylistId 
  options = {
    headers: { 'Authorization': 'Bearer ' + access_token }
  };
  try{
    response = await fetch(url, options); 
    json = await response.json();
    if(!response.ok)
      throw new Error("err");
  }catch{
    return res.status(500).send("Server Error")
  }
  newPlaylistImg = json.images[0] ? json.images[0].url : ""
  numTracks = json.tracks.total
  url = json.external_urls.spotify ? json.external_urls.spotify : "no link"

  res.json({img: newPlaylistImg, name: newPlaylistName, numTracks: numTracks, url: url});
 
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

  
  function createFormattedTrackList(trackList){
    formattedTrackList = []
    trackList.forEach(trackId => {
      let str = 'spotify:track:' + trackId;
      formattedTrackList.push(str)
    })
    return formattedTrackList;
  }
  
  async function createNewTrackList(artistTrackArray, res){
    let newTrackList = []

    for (artistTrack of artistTrackArray) {
      let artistId = artistTrack.artistId;
      let trackId = artistTrack.trackId;
      let newTrackId = await getRandomTrack(artistId, trackId, res);
      if(newTrackId == -1)
        return -1
      newTrackList.push(newTrackId);
    }
    return newTrackList;
  }


  async function getRandomTrack(artistId, trackId, res){ //get random track from artist, making sure it's not the original track
    var url = 'https://api.spotify.com/v1/artists/'+artistId+'/albums'
    var options = {
      headers: { 'Authorization': 'Bearer ' + access_token }
    };
    try{
      var response = await fetch(url, options);
      var json = await response.json();
      if(!response.ok)
        throw new Error("err");
    }catch{
      return -1
    }
    var albums = json.items;
    var randNum = getRandomInt(albums.length)
    var randAlbumId = albums[randNum].id

    
    var url = 'https://api.spotify.com/v1/albums/'+randAlbumId+'/tracks'
    var options = {
      headers: { 'Authorization': 'Bearer ' + access_token }
    };
    try{
      response = await fetch(url, options);
      json = await response.json();
      if(!response.ok)
        throw new Error("err");
    }catch{
      return res.status(500).send("Server Error");
    }
    var tracks = json.items;
    var randNum = getRandomInt(tracks.length)
    var randTrackId = tracks[randNum].id

    return randTrackId;
  }
})




app.get('/logout', function(req, res){
  res.clearCookie('access_token')
  res.clearCookie('refresh_token')
  res.clearCookie('name')
  res.clearCookie('userId')
  res.redirect('/')

})






function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}


async function getNewAccessToken(refresh_token){
  let url = 'https://accounts.spotify.com/api/token?refresh_token='+refresh_token+'&grant_type=refresh_token'
  let options = {
    method: 'POST',
    headers: { 
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')),
      'Content-Type':'application/x-www-form-urlencoded' 
    } 
  }
  try{
    var response = await fetch(url, options);
    var json = await response.json();
  }
  catch{
    return undefined;
  }
  let newAccessToken = json.access_token
  console.log("got new token: " + newAccessToken)

  return newAccessToken;
}
