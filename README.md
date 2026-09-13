# youtube-to-playlist-video

One model-compose release: a list of YouTube links rendered into one continuous video,
each track drawn frame by frame from an HTML template over its own audio spectrum, with
a browser editor to build the list.

| Path | What |
|---|---|
| `releases/youtube-to-playlist-video/` | the compose file, the editor, the frame templates, and the three READMEs |

This branch carries deliverables only.

## Running it

```
pip install model-compose
cd releases/youtube-to-playlist-video
model-compose up
```

Then open http://localhost:8081. The release's own README covers the Chrome sign-in
the downloads depend on and every setting the render takes.

The skills that built this release are on the `workflows/build-release` branch.
