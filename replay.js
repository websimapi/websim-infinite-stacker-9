export class ReplayRecorder {
    constructor(canvas, fps = 30) {
        this.canvas = canvas;
        this.chunks = [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordPromise = null;

        try {
            const stream = this.canvas.captureStream(fps);
            const mimeTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp8',
                'video/webm',
            ];
            const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

            if (!supportedMimeType) {
                console.error("No supported mimeType for MediaRecorder");
                return;
            }

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: supportedMimeType,
                videoBitsPerSecond: 5000000,
            });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.recordPromise = new Promise((resolve) => {
                this.mediaRecorder.onstop = () => {
                    const blob = new Blob(this.chunks, { type: supportedMimeType });
                    this.chunks = [];
                    resolve(blob);
                };
            });

            this.mediaRecorder.start();
            this.isRecording = true;
        } catch (e) {
            console.error("Error initializing MediaRecorder:", e);
        }
    }

    stop() {
        if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.isRecording = false;
    }

    async getReplayBlob() {
        if (!this.recordPromise) {
            return null;
        }
        return this.recordPromise;
    }
}