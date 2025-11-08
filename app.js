
// Resonant MVP — SoundCloud linked version (Edgar Ochoa – 8A The Experiment)

const CONFIG = {
  MODE: 'soundcloud',
  SOUNDCLOUD_URL: 'https://soundcloud.com/edgar-ochoa/8a-the-experiment',
  RADIOCO_STATION_ID: '',
  RADIOCO_STREAM: '',
  LINKS: {
    bandcampSearchBase: 'https://bandcamp.com/search?q=',
    discogsSearchBase: 'https://www.discogs.com/search/?q='
  }
};

// ------- Gate (2 invites strict) -------
const gate = document.getElementById('gate');
const player = document.getElementById('player');
const progressEl = document.getElementById('progress');
const sendBtn = document.getElementById('sendInvites');

function loadGateState() {
  const done = localStorage.getItem('resonant_invites_done') === '1';
  if (done) { gate.classList.add('hidden'); player.classList.remove('hidden'); initPlayer(); }
}
sendBtn?.addEventListener('click', () => {
  const email = document.getElementById('userEmail').value.trim();
  const i1 = document.getElementById('invite1').value.trim();
  const i2 = document.getElementById('invite2').value.trim();
  if (!email || !i1 || !i2) { alert('Enter your email and two invites.'); return; }
  localStorage.setItem('resonant_user', email);
  localStorage.setItem('resonant_invites', JSON.stringify([i1, i2]));
  progressEl.textContent = '2 / 2 invitations sent';
  localStorage.setItem('resonant_invites_done', '1');
  gate.classList.add('hidden');
  player.classList.remove('hidden');
  initPlayer();
});

// ------- Player Common UI -------
const cover = document.getElementById('cover');
const artistEl = document.getElementById('artist');
const titleEl = document.getElementById('title');
const labelEl = document.getElementById('label');
const albumEl = document.getElementById('album');
const playPauseBtn = document.getElementById('playPause');
const elapsedEl = document.getElementById('elapsed');
const durationEl = document.getElementById('duration');
const barFill = document.getElementById('barFill');
const scFrame = document.getElementById('scFrame');
const bandcampLink = document.getElementById('bandcamp');
const discogsLink = document.getElementById('discogs');

function setLinks(artist, title) {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  bandcampLink.href = CONFIG.LINKS.bandcampSearchBase + q;
  discogsLink.href = CONFIG.LINKS.discogsSearchBase + q;
}
function setCover(url) {
  if (url) cover.style.backgroundImage = `url('${url}')`;
}
function setMeta({ artist, title }) {
  artistEl.textContent = artist || '';
  titleEl.textContent = title || '';
  setLinks(artist || '', title || '');
}
function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' + r : r);
}

// ------- SoundCloud Mode -------
let scWidget = null;
function initSoundCloud() {
  const src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(CONFIG.SOUNDCLOUD_URL) +
              '&auto_play=false&show_user=false&show_teaser=false&visual=false';
  scFrame.src = src;
  scFrame.classList.remove('hidden');
  scWidget = window.SC && window.SC.Widget ? window.SC.Widget(scFrame) : null;
  if (!scWidget) return;

  scWidget.bind(window.SC.Widget.Events.READY, () => {
    scWidget.getCurrentSound((sound) => {
      if (!sound) return;
      const artist = sound.user?.username || '';
      const title = sound.title || '';
      const art = (sound.artwork_url || sound.user?.avatar_url) || '';
      const hi = art ? art.replace('-large', '-t500x500') : '';
      setCover(hi || art);
      setMeta({ artist, title });
      durationEl.textContent = mmss(sound.duration || 0);
    });
  });

  let playing = false;
  playPauseBtn.addEventListener('click', () => {
    if (!playing) scWidget.play(); else scWidget.pause();
  });
  scWidget.bind(window.SC.Widget.Events.PLAY, () => { playing = true; playPauseBtn.textContent = 'Pause'; });
  scWidget.bind(window.SC.Widget.Events.PAUSE, () => { playing = false; playPauseBtn.textContent = 'Play'; });
  scWidget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (obj) => {
    elapsedEl.textContent = mmss(obj.currentPosition || 0);
    scWidget.getCurrentSound((sound) => {
      const dur = sound?.duration || 0;
      durationEl.textContent = mmss(dur);
      const pct = dur ? Math.min(100, (obj.currentPosition / dur) * 100) : 0;
      barFill.style.width = pct + '%';
    });
  });
}

function initPlayer() {
  if (CONFIG.MODE === 'soundcloud') initSoundCloud();
}
loadGateState();
