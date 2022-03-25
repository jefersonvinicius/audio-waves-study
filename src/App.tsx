import React, { useEffect, useRef, useState } from 'react';

import './App.css';

const PIDS = 10;

type Point = {
  y: number;
};

function useAudioInputs() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(async (stream) => {
        stream.getTracks().forEach((t) => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
      })
      .catch(alert);
  }, []);

  return inputs;
}

export default function App() {
  const volumeInterval = useRef<number | null>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [average, setAverage] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioInputSelectedId, setAudioInputSelectedId] = useState('');

  const audioInputs = useAudioInputs();

  useEffect(() => {
    function fillCanvasWidth() {
      setCanvasWidth(canvasBox.current?.getBoundingClientRect().width ?? 0);
    }

    fillCanvasWidth();
    window.addEventListener('resize', fillCanvasWidth);
    return () => window.removeEventListener('resize', fillCanvasWidth);
  }, []);

  async function handleAccessMicrophoneClick() {
    if (!audioInputSelectedId) {
      alert('Selecione um dispositivo de saída de áudio');
      return;
    }

    let points: Point[] = [];
    const ctx = canvas.current?.getContext('2d')!;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    const volumes = new Uint8Array(analyser.frequencyBinCount);

    mediaRecorder.current = new MediaRecorder(stream);
    mediaRecorder.current.addEventListener('dataavailable', handleDataAvailable);
    mediaRecorder.current.addEventListener('stop', handleStop);
    mediaRecorder.current.start();

    volumeInterval.current = window.setInterval(createVolumeCallback());
    setIsStreaming(true);

    function handleDataAvailable(event: BlobEvent) {
      audioChunks.current.push(event.data);
    }

    function handleStop() {
      const blob = new Blob(audioChunks.current);
      const url = URL.createObjectURL(blob);
      audioChunks.current = [];
      setAudioUrl(url);
    }

    function createVolumeCallback() {
      ctx.strokeStyle = 'black';
      const maxPoints = Math.floor(canvasWidth / 5);
      return () => {
        analyser.getByteFrequencyData(volumes);
        const averageVolume = calculateAverageVolume();
        setAverage(averageVolume);
        drawPoints();
        if (points.length >= maxPoints) points = points.slice(1, points.length);
        points.push({ y: averageVolume });
      };
    }

    function drawPoints() {
      ctx.clearRect(0, 0, canvasWidth, 300);
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(index * 5, Math.min(150, 150 - point.y));
        } else {
          ctx.lineTo(index * 5, Math.min(150, 150 - point.y));
        }
      });
      ctx.stroke();
    }

    function calculateAverageVolume() {
      const total = volumes.reduce((prev, current) => prev + current, 0);
      return total / volumes.length;
    }
  }

  function handleStopClick() {
    if (volumeInterval.current) window.clearInterval(volumeInterval.current);
    setAverage(0);
    mediaRecorder.current?.stop();
    setIsStreaming(false);
  }

  const pidsToColor = Math.round(average / PIDS);

  return (
    <div className="container">
      <div className="content">
        <select
          className="input-audio-select"
          value={audioInputSelectedId}
          onChange={(e) => setAudioInputSelectedId(e.target.value)}
        >
          <option value="">Não Selecionado</option>
          {audioInputs.map((input) => (
            <option key={input.deviceId} value={input.deviceId}>
              {input.label}
            </option>
          ))}
        </select>
        {isStreaming ? (
          <button onClick={handleStopClick}>Stop</button>
        ) : (
          <button onClick={handleAccessMicrophoneClick}>Start</button>
        )}
        <div className="pids-box">
          {Array.from(Array(PIDS)).map((_, index) => {
            return (
              <div
                key={String(index)}
                className="pid"
                style={{ backgroundColor: index < pidsToColor ? '#69ce2b' : '#e6e7e8' }}
              />
            );
          })}
        </div>
        <div ref={canvasBox} className="canvas-box">
          <canvas ref={canvas} width={`${canvasWidth}px`} height="300px" />
        </div>
        {audioUrl && !isStreaming && (
          <audio className="audio-result" controls>
            <source src={audioUrl} />
          </audio>
        )}
      </div>
    </div>
  );
}
