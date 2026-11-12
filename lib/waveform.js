// Decorative playback animation, NOT an audio-spectrum analyzer.
const FRAMES = [
    [3, 9, 5, 12],
    [9, 4, 12, 6],
    [6, 13, 4, 8],
    [12, 7, 11, 3],
    [5, 11, 7, 13],
    [10, 5, 13, 6],
    [7, 12, 4, 9],
    [12, 6, 10, 4],
];

export function waveFrame(index) {
    if (!Number.isInteger(index))
        return FRAMES[0];
    return FRAMES[((index % FRAMES.length) + FRAMES.length) % FRAMES.length];
}
