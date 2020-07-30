require('dotenv').config()
const fetch = require("node-fetch");
const express = require('express')
const request = require('request');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const { response } = require('express');
const { get } = require('request');
const app = express()
app.use(cookieParser());
app.set('view engine', 'ejs');
app.listen(process.env.PORT || 8080, ()=>console.log("listening..."))



const client_id = process.env.CLIENT_ID
const redirect_uri = process.env.REDIRECT_URI
const client_secret = process.env.CLIENT_SECRET


async function getNewAccessToken(refresh_token){
  let url = 'https://accounts.spotify.com/api/token?refresh_token='+refresh_token+'&grant_type=refresh_token'
  let options = {
    method: 'POST',
    headers: { 
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')),
      'Content-Type':'application/x-www-form-urlencoded' 
    } 
  }
  let response = await fetch(url, options);
  let json = await response.json();
  let newAccessToken = json.access_token
  console.log("got new token: " + newAccessToken)

  return newAccessToken;
}




app.get('/', function(req, res) {
  let refresh_token = req.cookies.refresh_token;
  let access_token = req.cookies.access_token;
  if(!(refresh_token && access_token))
    res.redirect('/login');
  else
    res.redirect('/home');
});















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
    res.cookie('access_token', access_token, {expires: new Date(Date.now() + 1000*60*59)})
  }


  //get artist/track list from playlist id
  let params = "?fields=tracks.items(track(name,href,artists,album(name,href)))"
  let url = 'https://api.spotify.com/v1/playlists/' + playlistId + params
  let options = {
    headers: { 'Authorization': 'Bearer ' + access_token }
  };
  let response = await fetch(url, options);
  let json  = await response.json();
  let tracks = json.tracks.items
  let artistTrackArray = []
    tracks.forEach(item => {                   //extract artist id and track id of each track
      let artistId = item.track.artists[0].id;
      let trackId = item.track.id
      artistTrackArray.push({artistId: artistId, trackId: trackId})
    })
  let newTrackList = await createNewTrackList(artistTrackArray);



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
  response = await fetch(url, options); 
  json = await response.json();
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
  response = await fetch(url, options); 
  json = await response.json();
  let newPlaylistInfo = json;

  //get new playlist img, tracks, length
  params = "?fields=tracks.items(track(name,href,artists,album(name,href))),images,name"
  url = 'https://api.spotify.com/v1/playlists/' + playlistId + params
  options = {
    headers: { 'Authorization': 'Bearer ' + access_token }
  };
  response = await fetch(url, options);
  json  = await response.json();
  newPlaylistImg = json.images[0] ? json.images[0].url : ""
  tracks = json.tracks.items

  res.send({img: newPlaylistImg, name: newPlaylistName, tracks: tracks});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////

  
  function createFormattedTrackList(trackList){
    formattedTrackList = []
    trackList.forEach(trackId => {
      let str = 'spotify:track:' + trackId;
      formattedTrackList.push(str)
    })
    return formattedTrackList;
  }
  
  async function createNewTrackList(artistTrackArray){
    let newTrackList = []

    for (artistTrack of artistTrackArray) {
      let artistId = artistTrack.artistId;
      let trackId = artistTrack.trackId;
      let newTrackId = await getRandomTrack(artistId, trackId);
      newTrackList.push(newTrackId);
    }
    return newTrackList;
  }


  async function getRandomTrack(artistId, trackId){ //get random track from artist, making sure it's not the original track
    var url = 'https://api.spotify.com/v1/artists/'+artistId+'/albums'
    var options = {
      headers: { 'Authorization': 'Bearer ' + access_token }
    };
    var response = await fetch(url, options);
    var json = await response.json();
    var albums = json.items;
    var randNum = getRandomInt(albums.length)
    var randAlbumId = albums[randNum].id

    
    var url = 'https://api.spotify.com/v1/albums/'+randAlbumId+'/tracks'
    var options = {
      headers: { 'Authorization': 'Bearer ' + access_token }
    };
    var response = await fetch(url, options);
    var json = await response.json();
    var tracks = json.items;
    var randNum = getRandomInt(tracks.length)
    var randTrackId = tracks[randNum].id

    return randTrackId;
  }
})











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







//navigate to for first time - no access token
//navigate to again - valid access token
//navigate to again - expired access token 
app.get('/home', async function(req, res){ 
  let refresh_token = req.cookies.refresh_token;
  let access_token = req.cookies.access_token;
  let name = req.cookies.name;
  let userId = req.cookies.userId
  if(!refresh_token)//access token expired or doesn't exist (better if expired access token just requested new one?)
    res.redirect('/login');
  if(!access_token){
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
    var filteredPlaylistArray = []
    playlistsArray.forEach(playlist => {
      var name = playlist.name
      var id = playlist.id
      filteredPlaylistArray.push({name: name, id: id})
    });
    res.render('home', {playlists: filteredPlaylistArray, name: name})
  }
  catch{
  }
})












app.get('/callback', async (req, res) => {
    var code = req.query.code || null;
    console.log("CODE: " + code)
    //var state = req.query.state || null;
    //var storedState = req.cookies ? req.cookies[stateKey] : null;


    var url = 'https://accounts.spotify.com/api/token?code='+code+'&redirect_uri='+redirect_uri+'&grant_type=authorization_code';
    var headers = {'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')),
                    'Content-Type':'application/x-www-form-urlencoded'}
    var options = { method : 'POST',
                    headers: headers
    }
    
    fetch(url, options)
    .then(response => response.json()).catch(err => res.send("err1" +err))
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
          res.redirect('/home')
          
        })
    }).catch(err => res.send("err2" +err))
});

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}