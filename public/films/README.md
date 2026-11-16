# Your films go here

The gallery page plays a film on the wall of each room and a trailer before you walk in. They aren't in this repo, so every wall shows a "Your film here" frame until you add your own.

1. Put a 16:9 MP4 per room in this folder: `room-01.mp4` to `room-06.mp4`. A trailer goes in as `trailer.mp4`.
2. List them in `films.json`, for example:

```json
{
  "rooms": ["01", "02", "03", "04", "05", "06"],
  "trailer": true
}
```

Rooms that aren't listed keep the frame. The page only asks for the files you list, so nothing errors in the meantime.

The prompts I used for my films, with their settings and credit cost, are on the room films sheet: `room-films/index.html`.
