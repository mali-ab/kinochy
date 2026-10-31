import { Activity, AlertTriangle, BarChart3, Captions, Radio, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'shaka-player/dist/controls.css';
import { withBasePath } from '../paths';

const emptyDiagnostics = {
  resolution: 'Waiting…',
  bandwidth: '—',
  buffer: '0.0 s',
  frames: '—',
  format: '—'
};

export default function AdminMediaPlayer({ movie, subtitles = {}, title, onClose }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [selectedSubtitleLanguages, setSelectedSubtitleLanguages] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [diagnostics, setDiagnostics] = useState(emptyDiagnostics);
  const subtitleSignature = JSON.stringify(Object.entries(subtitles).sort(([left],[right]) => left.localeCompare(right)));
  const prefersHls = Boolean(movie.streaming?.hls);
  const source = useMemo(() => {
    if (prefersHls) {
      const version = encodeURIComponent(movie.updatedAt || 'current');
      return withBasePath(`/media/movies/${movie.id}/playlist.m3u8?v=${version}`);
    }
    return withBasePath(`/media/movies/${movie.id}/video`);
  }, [movie.id, movie.updatedAt, prefersHls]);

  useEffect(() => {
    let disposed = false;
    let player;
    let overlay;
    let statsTimer;
    let updateTime;
    const subtitleUrls = [];

    async function initialize() {
      setLoading(true);
      setError('');
      setDiagnostics(emptyDiagnostics);
      try {
        const { default: shaka } = await import('shaka-player/dist/shaka-player.ui.js');
        if (disposed) return;
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) throw new Error('This browser does not support adaptive media playback.');

        player = new shaka.Player();
        await player.attach(videoRef.current);
        playerRef.current = player;
        player.configure({
          abr: { enabled: true },
          streaming: {
            bufferingGoal: 20,
            rebufferingGoal: 2,
            bufferBehind: 20,
            retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2, fuzzFactor: .5 }
          },
          manifest: { retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2, fuzzFactor: .5 } }
        });

        overlay = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);
        overlay.configure({
          addSeekBar: true,
          enableKeyboardPlaybackControls: true,
          enableTooltips: true,
          doubleClickForFullscreen: true,
          bigButtons: [],
          controlPanelElements: ['play_pause', 'rewind', 'fast_forward', 'time_and_duration', 'spacer', 'mute', 'volume', 'fullscreen', 'overflow_menu'],
          overflowMenuButtons: ['quality', 'language', 'playback_rate', 'picture_in_picture', 'statistics'],
          seekBarColors: { base: 'rgba(255,255,255,.26)', buffered: 'rgba(94,234,212,.4)', played: '#2dd4bf', adBreaks: '#f59e0b', chapters: '#60a5fa' },
          volumeBarColors: { base: 'rgba(255,255,255,.25)', level: '#5eead4' },
          fadeDelay: 3
        });

        player.addEventListener('error', (event) => {
          const code = event.detail?.code ? ` (${event.detail.code})` : '';
          setError(`Playback error${code}. Check the playlist, media segments, and server access.`);
        });
        if (prefersHls) {
          await player.load(source);
          await addSubtitleTracks(player, subtitles, subtitleUrls);
          // Shaka 5 uses a null text-track selection to disable its single-track
          // renderer. The admin overlay below can render up to four tracks.
          player.selectTextTrack(null);
        } else {
          videoRef.current.src = source;
          videoRef.current.load();
          await new Promise((resolve, reject) => {
            videoRef.current.addEventListener('loadedmetadata', resolve, { once: true });
            videoRef.current.addEventListener('error', () => reject(new Error('The source video could not be loaded.')), { once: true });
          });
        }
        if (disposed) return;
        const available = Object.entries(subtitles).filter(([, cues]) => cues?.length).map(([language]) => language);
        setSelectedSubtitleLanguages((current) => current.filter((language) => available.includes(language)));
        updateTime = () => setCurrentTime(videoRef.current?.currentTime || 0);
        videoRef.current.addEventListener('timeupdate', updateTime);
        setLoading(false);
        updateDiagnostics(player, videoRef.current, prefersHls, setDiagnostics);
        statsTimer = window.setInterval(() => updateDiagnostics(player, videoRef.current, prefersHls, setDiagnostics), 1000);
      } catch (issue) {
        if (!disposed) {
          setLoading(false);
          setError(issue?.message || 'The media could not be loaded.');
        }
      }
    }

    initialize();
    return () => {
      disposed = true;
      window.clearInterval(statsTimer);
      overlay?.destroy();
      playerRef.current = null;
      player?.destroy();
      subtitleUrls.forEach((url) => URL.revokeObjectURL(url));
      if (videoRef.current) {
        if (updateTime) videoRef.current.removeEventListener('timeupdate', updateTime);
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [prefersHls, source, subtitleSignature]);

  const availableSubtitleLanguages = Object.entries(subtitles).filter(([, cues]) => cues?.length).map(([language]) => language);
  const visibleCues = selectedSubtitleLanguages.map((language) => ({ language, cue: cueAt(subtitles[language], currentTime) })).filter((item) => item.cue);

  function toggleSubtitle(language) {
    setSelectedSubtitleLanguages((current) => current.includes(language) ? current.filter((item) => item !== language) : current.length < 4 ? [...current, language] : current);
  }

  return <section className="admin-media-player" aria-label={`${title || movie.title} preview player`}>
    <header className="admin-media-player-head">
      <div><span><Radio size={13} /> Admin preview</span><strong>{title || movie.titleEn || movie.title}</strong><small>{prefersHls ? 'Adaptive HLS stream' : 'Source video'} · Full administrator access</small></div>
      <div className="admin-player-head-actions"><div className="admin-multi-subtitles"><button type="button" className={selectedSubtitleLanguages.length ? 'active' : ''} aria-expanded={subtitleMenuOpen} onClick={() => setSubtitleMenuOpen((value) => !value)}><Captions size={17} /> Subtitles {selectedSubtitleLanguages.length ? `· ${selectedSubtitleLanguages.length}` : ''}</button>{subtitleMenuOpen ? <div className="admin-subtitle-menu"><strong>Visible subtitles</strong><small>Select up to four tracks</small>{availableSubtitleLanguages.length ? availableSubtitleLanguages.map((language) => <label key={language}><input type="checkbox" checked={selectedSubtitleLanguages.includes(language)} disabled={!selectedSubtitleLanguages.includes(language) && selectedSubtitleLanguages.length >= 4} onChange={() => toggleSubtitle(language)} /><span>{languageName(language)}</span><i>{language.toUpperCase()}</i></label>) : <p>No subtitle tracks uploaded.</p>}<button type="button" onClick={() => setSelectedSubtitleLanguages([])}>Hide all</button></div> : null}</div><button type="button" className={showDiagnostics ? 'active' : ''} aria-pressed={showDiagnostics} onClick={() => setShowDiagnostics((value) => !value)}><BarChart3 size={16} /> Diagnostics</button>{onClose ? <button type="button" onClick={onClose}><X size={17} /> Close</button> : null}</div>
    </header>
    <div ref={containerRef} className="admin-shaka-container" data-shaka-player-container>
      <video ref={videoRef} className="admin-shaka-video" data-shaka-player playsInline poster={movie.coverUrl || undefined} />
      {visibleCues.length ? <div className="admin-multi-subtitle-overlay">{visibleCues.map(({ language, cue }) => <p key={language} data-language={language}><span>{language.toUpperCase()}</span>{cue.text}</p>)}</div> : null}
      {loading ? <div className="admin-player-loading"><Activity size={22} /> Preparing stream…</div> : null}
      {error ? <div className="admin-player-error"><AlertTriangle size={22} /><strong>Unable to play this title</strong><span>{error}</span></div> : null}
    </div>
    {showDiagnostics ? <div className="admin-player-diagnostics">
      <Diagnostic label="Active rendition" value={diagnostics.resolution} />
      <Diagnostic label="Est. bandwidth" value={diagnostics.bandwidth} />
      <Diagnostic label="Buffered ahead" value={diagnostics.buffer} />
      <Diagnostic label="Dropped frames" value={diagnostics.frames} />
      <Diagnostic label="Stream format" value={diagnostics.format} />
    </div> : null}
  </section>;
}

function Diagnostic({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

async function addSubtitleTracks(player, subtitles, urls) {
  const tracks = Object.entries(subtitles).map(([language, cues]) => ({ language, label: languageName(language), cues }));
  for (const track of tracks) {
    if (!track.cues?.length) continue;
    const body = track.cues.map((cue, index) => `${index + 1}\n${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${String(cue.text).replaceAll('-->', '→')}\n`).join('\n');
    const url = URL.createObjectURL(new Blob([`WEBVTT\n\n${body}`], { type: 'text/vtt' }));
    urls.push(url);
    await player.addTextTrackAsync(url, track.language, 'subtitle', 'text/vtt', '', track.label);
  }
}

function cueAt(cues = [], time) {
  return cues.find((cue) => time >= cue.start && time < cue.end) || null;
}

function languageName(code) {
  if (code === 'tk') return 'Turkish';
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
}

function vttTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = (safe % 60).toFixed(3).padStart(6, '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainder}`;
}

function updateDiagnostics(player, video, prefersHls, setDiagnostics) {
  if (!player || !video) return;
  const stats = player.getStats();
  const active = player.getVariantTracks().find((track) => track.active);
  const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : video.currentTime;
  const dropped = Number(stats.droppedFrames || 0);
  const decoded = Number(stats.decodedFrames || 0);
  setDiagnostics({
    resolution: active?.height ? `${active.width || '—'} × ${active.height} · ${Math.round((active.bandwidth || 0) / 1000)} kbps` : video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : 'Auto',
    bandwidth: stats.estimatedBandwidth ? `${(stats.estimatedBandwidth / 1_000_000).toFixed(2)} Mbps` : 'Calculating…',
    buffer: `${Math.max(0, bufferedEnd - video.currentTime).toFixed(1)} s`,
    frames: decoded ? `${dropped} / ${decoded}` : '—',
    format: prefersHls ? 'HLS · adaptive' : 'MP4 · progressive'
  });
}
