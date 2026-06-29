export class AudioManager {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animationFrame: number | null = null;

  private fftSize = 2048;
  private highpassHz = 250;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioCtx();

    const source = this.context.createMediaStreamSource(this.stream);
    const filter = this.context.createBiquadFilter();
    const analyser = this.context.createAnalyser();

    filter.type = "highpass";
    filter.frequency.value = this.highpassHz;

    analyser.fftSize = this.fftSize;

    source.connect(filter);
    filter.connect(analyser);

    this.source = source;
    this.filter = filter;
    this.analyser = analyser;
  }

  getTimeDomainData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(0);
    }
    const buffer = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buffer);
    return buffer;
  }

  getSampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  getBinSize(): number {
    if (!this.context) return 0;
    return this.context.sampleRate / this.fftSize;
  }

  isActive(): boolean {
    return this.context !== null && this.context.state !== "closed";
  }

  requestAnimationLoop(callback: () => void): void {
    const loop = () => {
      if (!this.isActive()) return;
      callback();
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.filter) {
      this.filter.disconnect();
      this.filter = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.context && this.context.state !== "closed") {
      this.context.close();
      this.context = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
