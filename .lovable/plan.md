# Use your own Gemini key for YouTube Shorts / video analysis

## What's already in place
The Short Builder features already use Google Gemini directly. That includes picking the best clips, writing captions, finding filler sounds and suggesting a title. They read a secure setting called `GEMINI_API_KEY`, so switching to your key doesn't need any new code.

## Steps
1. I open a secure form where you paste the key you created in Google AI Studio. It starts with `AIza...`. The key goes straight to encrypted storage and never shows up in chat or in the code.
2. If a key is already saved, the form replaces it. If not, it adds it.
3. I test with one video clip to confirm Gemini accepts your key. If it doesn't, I show you the exact error, such as an invalid key, a used-up quota or billing not turned on.
4. Optional: I also point the older text tool (`gemini-ai`) at your key so every Gemini call uses the same account.

## What you'll need
- Your key from aistudio.google.com, under Get API key.
- For long videos, billing turned on for that Google project. The free tier limits video size and how many requests you can make.

## Technical details
- Secret name: `GEMINI_API_KEY`. `identify-video-clips` and `transcribe-video-captions` read it with `Deno.env.get`.
- Updated with the secure form tool. The functions pick up the new value on the next request, so nothing needs redeploying.
- Model stays `gemini-2.5-flash` unless you ask for a different one, for example `gemini-2.5-pro` for more detailed judging.
