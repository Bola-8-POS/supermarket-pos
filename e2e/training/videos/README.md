# Combo promotions — training videos

Captioned screen recordings for the user manual / staff training deck.

| File | Shows | Length |
|---|---|---|
| `combo-wizard.mp4` | Admin: build a "3x2" combo in Promotions → New Promotion (kind, composition, pricing, save) | ~18s |
| `combo-checkout.mp4` | Cashier: scan 3 combo-eligible items, discount auto-applies, pay, receipt shows it | ~20s |

## Regenerating

```bash
npm run test:e2e:training
```

Runs `e2e/training/*.spec.ts` against the local dev server + Supabase (`playwright.training.config.ts`, headless, 1440×900, video on). Outputs to `e2e-results-training/<test>/video.webm`; copy the ones you want here and re-encode to mp4 if needed:

```bash
ffmpeg -y -i e2e-results-training/<test-folder>/video.webm -c:v libx264 -pix_fmt yuv420p -crf 20 e2e/training/videos/<name>.mp4
```

Regenerate whenever the Promotions dialog or POS checkout UI changes visibly, so the videos stay accurate.
