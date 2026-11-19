# Help video guides

Short screen recordings of FRAME, made by FRAME itself: the frame driver runs the app in
headless Chrome, a script clicks and drags through a task with a visible cursor, and the
frames are encoded to WebM in Chrome (MediaRecorder), so nothing needs installing.

    bash tools/clips/record.sh        # all clips
    bash tools/clips/record.sh 02     # just one

Output: `help/clips/<name>.webm` plus `<name>.jpg` (the poster Help shows before play).
Re-record after a UI change that a clip shows; a clip that cannot find a control stops with
`not found: <selector>`.

- `rec.js`: the recorder. `click`, `drag`, `type`, `key`, `move` drive real input;
  `cap('<span class="n">1</span>Text with <b>bold</b>')` sets the caption (drawn by the
  encoder, so zooms never crop it); `zoom(x, y, w, ms)` / `full(ms)` ease the camera; `chooseFiles`
  answers the next file dialog; `imgPt` maps image pixels to the screen.
- `encoder.html`: plays the frames at their real timing with the camera and captions, records WebM.
- `peek.js <video> <out.jpg> <seconds...>`: frames out of a finished video, to check it.
- `drawings.js`: makes the two fictional Tideline Hotel drawings in `assets/`. **Clips go on a
  public site: never record with a client's drawings, names or images.**
- `prep2.js`: the state clip 1 ends in, made without the camera, so clip 2 starts there.
