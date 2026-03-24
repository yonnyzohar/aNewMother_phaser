export class SlideObj {
    pageNum: number = 0;   // matches pages/<pageNum>/ folder
    sound: string = "";    // filename only, e.g. "1.mp3"
    caption: string = "";
    voices: Record<string, string> = {};  // MC name → audio path
}
