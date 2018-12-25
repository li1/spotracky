var stateKey = 'spotify_auth_state';

/**
 * Obtains parameters from the hash of the URL
 * @return Object
 */
function getHashParams() {
  var hashParams = {};
  var e, r = /([^&;=]+)=?([^&;]*)/g,
    q = window.location.hash.substring(1);
  while (e = r.exec(q)) {
    hashParams[e[1]] = decodeURIComponent(e[2]);
  }
  return hashParams;
}

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
function generateRandomString(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

oauthSource = document.getElementById('oauth-template').innerHTML,
  oauthTemplate = Handlebars.compile(oauthSource),
  oauthPlaceholder = document.getElementById('oauth');

var params = getHashParams();

var access_token = params.access_token,
  state = params.state,
  storedState = localStorage.getItem(stateKey);

let userId;

const loadLoggedIn = async () => {
  const req = await fetch('https://api.spotify.com/v1/me', {
    headers: { 'Authorization': 'Bearer ' + access_token },
  });
  const response = await req.json();

  userId = response.id;
  return response;

};

const loadPlaylists = async () => {
  const playlists = [];
  let url = 'https://api.spotify.com/v1/me/playlists';
  while (url) {
    const req = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + access_token },
    });
    const body = await req.json();

    playlists.push(body);
    url = body.next;
  }

  return playlists
    .map(p => p.items)
    .flat()
    .filter(p => p.owner.id === userId);
};

const loadSongsInPlaylists = async (playlists) => {
  const songs = playlists
    .map(p => fetch(p.tracks.href, {
      headers: { 'Authorization': 'Bearer ' + access_token },
    }));
  const songResults = await Promise.all(songs.map(async r => await r));
  const songResultJsons = songResults.map(r => r.json());

  return await Promise.all(songResultJsons.map(async r => await r));
};

const loadAllSongs = async (songsInPlaylist) => {
  const allSongs = [];

  for (const song of songsInPlaylist) {
    allSongs.push(song);
    let url = song.next;
    while (url) {
      const req = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + access_token },
      });
      const body = await req.json();

      allSongs.push(body);
      url = body.next;
    }
  }

  return allSongs.map(song => song.items)
    .flat()
    .map(s => ({ id: s.track.id, name: s.track.name }));
};

const loadSavedSongs = async () => {
  let url = 'https://api.spotify.com/v1/me/tracks?offset=0&limit=50';
  const songs = [];

  while (url) {
    const req = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + access_token },
    });
    const body = await req.json();

    songs.push(body.items);
    url = body.next;
  }

  return songs
    .flat()
    .map(s => ({ id: s.track.id, name: s.track.name }));
};

// hardcoded to relate by id
const relate = (arr) => {
  const rel = {};
  for (const e of arr) {
    rel[e.id] = e;
  }
  return rel;
};

const setDifference = (arr1, arr2) => {
  const rel2 = relate(arr2);

  return arr1.filter(x => !rel2[x.id]);
};

const makePlaylist = async (name) => {
  const url = `https://api.spotify.com/v1/users/${userId}/playlists`;

  return await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      public: false,
    })
  });
};

const addTracksToPlaylist = async (id, tracks) => {
  const url = `https://api.spotify.com/v1/playlists/${id}/tracks`;

  let splicedTracks = [...tracks];

  while (splicedTracks.length > 0) {
    const splice = splicedTracks.splice(0, 100);
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: splice,
      })
    });
  }
  console.log('adding tracks done');
};

const makeOverview = async () => {
  const profile = await loadLoggedIn();
  const playlists = await loadPlaylists();
  const songsInPlaylists = await loadSongsInPlaylists(playlists);
  const playlistSongIds = await loadAllSongs(songsInPlaylists);
  const savedSongs = await loadSavedSongs();
  const unsavedSongsInPlaylists = setDifference(playlistSongIds, savedSongs);
  const songsWithoutPlaylist = setDifference(savedSongs, playlistSongIds);

  const data = { profile, playlists, unsavedSongsInPlaylists, songsWithoutPlaylist };

  var userProfileSource = document.getElementById('user-profile-template').innerHTML,
    userProfileTemplate = Handlebars.compile(userProfileSource),
    userProfilePlaceholder = document.getElementById('user-profile');

  userProfilePlaceholder.innerHTML = userProfileTemplate(data);

  $('#login').hide();
  $('#loggedin').show();

  document.getElementById('unsaved-button').addEventListener('click', async () => {
    const res = await makePlaylist('unsaveds');
    const body = await res.json();
    const id = body.id;
    const tracks = unsavedSongsInPlaylists.map(x => `spotify:track:${x.id}`);
    addTracksToPlaylist(id, tracks);
  });

  document.getElementById('no-playlist-button').addEventListener('click', async () => {
    const res = await makePlaylist('unassigneds');
    const body = await res.json();
    const id = body.id;
    const tracks = songsWithoutPlaylist.map(x => `spotify:track:${x.id}`);
    addTracksToPlaylist(id, tracks);
  });
};

if (access_token && (state == null || state !== storedState)) {
  alert('There was an error during the authentication');
} else {
  localStorage.removeItem(stateKey);
  if (access_token) {
    makeOverview();

  } else {
    $('#login').show();
    $('#loggedin').hide();
  }

  document.getElementById('login-button').addEventListener('click', function() {
    var client_id = 'bf5570c1f6fa41e8b256ef1923a81b41'; // Your client id
    // var client_secret = 'dddd624ee37b4d428d891c64f929af04'; // Your secret
    var redirect_uri = 'http://localhost:8888'; // Your redirect uri

    var state = generateRandomString(16);

    localStorage.setItem(stateKey, state);
    var scope = 'user-read-private user-read-email playlist-read-private playlist-modify-private user-library-read';

    var url = 'https://accounts.spotify.com/authorize';
    url += '?response_type=token';
    url += '&client_id=' + encodeURIComponent(client_id);
    url += '&scope=' + encodeURIComponent(scope);
    url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
    url += '&state=' + encodeURIComponent(state);

    window.location = url;
  }, false);
}

