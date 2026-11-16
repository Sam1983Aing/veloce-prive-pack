# The films

`room-01.mp4` to `room-06.mp4` play on the walls of the gallery's six rooms, and `trailer.mp4` plays when you click Watch trailer. They're the films from the video, made with Higgsfield. The prompts behind them are on the room films sheet (`room-films/`).

To use your own, replace these files with 16:9 MP4s of your own and keep `films.json` listing the ones that are there:

```json
{
  "rooms": ["01", "02", "03", "04", "05", "06"],
  "trailer": true
}
```

A room that isn't listed shows a "Your film here" frame, and with `"trailer": false` the button says "Enter the gallery" and opens the hall straight away.
