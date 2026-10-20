# Adaptive evaluation and BKT fitting

Offline tools for checking the adaptive mode. See also _Adaptive mode_ in [features.md](features.md).

## BKT fitting

`npm run bkt:fit` is a report only; it never changes the app. It reads live-session responses from the database grouped by student and topic (or `npm run bkt:fit -- --file sequences.json` with `[{"topic": "algebra", "correct": [true, false, true]}]`) and fits `p_init`, `p_learn`, `p_slip` and `p_guess` per topic by maximizing the sequence likelihood with a deterministic pattern search from five starting points (not EM). Slip and guess are each capped at 0.3 and slip + guess must stay below 0.6 so the model stays identifiable. A topic with fewer than 30 sequences prints "insufficient data, keeping defaults". The fitted values are printed next to the current defaults (0.30, 0.15, 0.10, 0.20).

`npm run bkt:fit -- --synthetic` generates simulated sequences from known parameters and prints how well they are recovered (all errors within 0.06 with 2000 sequences of length 8 per topic).

## Adaptive evaluation

`npm run adaptive:eval` compares fixed random question order with the production adaptive selection on **simulated** students: P(correct) = sigmoid((ability - difficulty) / 173.7) (the same scale as the Elo formula), ability ~ N(1000, 200), true difficulty = label (800, 1000 or 1200) + N(0, 60). For pool sizes 10, 30 and 100 it simulates 500 students (seed 424242), gives both arms the same students, questions and random draws per question, and records the error of the final Elo estimate against true ability (RMSE) and the Spearman correlation after 3, 5, 8 and 10 answered questions, with a paired bootstrap 95% interval (1000 resamples) for the RMSE difference. It also sweeps the sampling width (sigma 100, 200 and 400; production is 200). Nothing was tuned to favour adaptive mode. Question ratings stay at their label (no drift across students), so this isolates the selection effect. These are simulated results, not evidence from real students.

```
adaptive:eval - SIMULATED students, not real-student evidence.
student model: P(correct) = sigmoid((ability - difficulty) / 173.7), ability ~ N(1000, 200), true difficulty = label (800/1000/1200) + N(0, 60).
500 students per pool size, seed 424242, pools 10/30/100, sigma sweep 100/200/400 (production: 200), 1000 bootstrap resamples (paired, 95% interval).
Both arms see the same students, the same questions and the same random draws per question. Question ratings stay at their label (no cross-student drift). Selection uses the production selectNextAdaptiveQuestion code.

pool  10: predicting 1000 for everyone has RMSE 212.8
pool  30: predicting 1000 for everyone has RMSE 185.5
pool 100: predicting 1000 for everyone has RMSE 199.3

pool arm             k    RMSE Spearman  RMSE diff vs fixed [95% CI]    verdict
-----------------------------------------------------------------------------------------
  10 fixed order     3   197.0    0.615
  10 adaptive s=100  3   194.6    0.668    -2.4 [-4.5, -0.6]            better
  10 adaptive s=200  3   195.8    0.662    -1.1 [-3.0, 0.7]             no significant difference
  10 adaptive s=400  3   196.6    0.641    -0.4 [-2.1, 1.6]             no significant difference
  10 fixed order     5   187.4    0.693
  10 adaptive s=100  5   184.0    0.735    -3.4 [-5.3, -1.4]            better
  10 adaptive s=200  5   186.2    0.725    -1.1 [-3.0, 0.8]             no significant difference
  10 adaptive s=400  5   186.5    0.723    -0.9 [-2.9, 1.0]             no significant difference
  10 fixed order     8   174.9    0.774
  10 adaptive s=100  8   171.0    0.793    -3.8 [-5.3, -2.3]            better
  10 adaptive s=200  8   172.5    0.802    -2.4 [-3.9, -0.9]            better
  10 adaptive s=400  8   172.8    0.808    -2.1 [-3.6, -0.6]            better
  10 fixed order    10   165.9    0.823
  10 adaptive s=100 10   166.2    0.818     0.2 [-0.2, 0.6]             no significant difference
  10 adaptive s=200 10   166.0    0.817     0.1 [-0.3, 0.5]             no significant difference
  10 adaptive s=400 10   166.0    0.818     0.1 [-0.3, 0.5]             no significant difference
  30 fixed order     3   172.0    0.545
  30 adaptive s=100  3   169.8    0.609    -2.1 [-4.5, 0.3]             no significant difference
  30 adaptive s=200  3   170.5    0.599    -1.4 [-3.8, 1.1]             no significant difference
  30 adaptive s=400  3   170.7    0.597    -1.3 [-3.7, 1.2]             no significant difference
  30 fixed order     5   162.2    0.676
  30 adaptive s=100  5   159.8    0.711    -2.5 [-5.7, 0.4]             no significant difference
  30 adaptive s=200  5   160.2    0.717    -2.0 [-4.6, 0.4]             no significant difference
  30 adaptive s=400  5   161.0    0.707    -1.3 [-4.1, 1.7]             no significant difference
  30 fixed order     8   150.4    0.761
  30 adaptive s=100  8   144.4    0.795    -6.0 [-9.4, -2.9]            better
  30 adaptive s=200  8   147.5    0.789    -3.0 [-5.9, -0.1]            better
  30 adaptive s=400  8   148.3    0.781    -2.1 [-5.0, 0.8]             no significant difference
  30 fixed order    10   143.2    0.800
  30 adaptive s=100 10   135.1    0.817    -8.1 [-11.5, -4.7]           better
  30 adaptive s=200 10   139.1    0.817    -4.1 [-7.3, -1.2]            better
  30 adaptive s=400 10   140.9    0.809    -2.3 [-5.2, 0.7]             no significant difference
 100 fixed order     3   183.7    0.624
 100 adaptive s=100  3   181.2    0.650    -2.5 [-4.8, -0.3]            better
 100 adaptive s=200  3   183.4    0.601    -0.3 [-2.5, 2.2]             no significant difference
 100 adaptive s=400  3   183.4    0.619    -0.4 [-2.7, 1.9]             no significant difference
 100 fixed order     5   174.7    0.686
 100 adaptive s=100  5   171.6    0.721    -3.1 [-6.4, 0.1]             no significant difference
 100 adaptive s=200  5   174.0    0.681    -0.6 [-3.6, 2.4]             no significant difference
 100 adaptive s=400  5   174.3    0.692    -0.4 [-3.8, 2.8]             no significant difference
 100 fixed order     8   162.4    0.768
 100 adaptive s=100  8   156.6    0.796    -5.8 [-9.1, -2.6]            better
 100 adaptive s=200  8   159.9    0.761    -2.5 [-6.0, 0.9]             no significant difference
 100 adaptive s=400  8   160.2    0.775    -2.2 [-5.6, 1.2]             no significant difference
 100 fixed order    10   154.4    0.813
 100 adaptive s=100 10   148.2    0.824    -6.1 [-9.8, -2.3]            better
 100 adaptive s=200 10   151.7    0.790    -2.7 [-6.2, 0.6]             no significant difference
 100 adaptive s=400 10   152.7    0.802    -1.6 [-5.3, 2.0]             no significant difference

across all 36 adaptive cells: 12 better, 24 no significant difference

Where production adaptive (sigma 200) does NOT beat fixed order: 9 of 12 cells
  pool 10, k=3: no significant difference (RMSE diff -1.1, 95% CI -3.0 to 0.7)
  pool 10, k=5: no significant difference (RMSE diff -1.1, 95% CI -3.0 to 0.8)
  pool 10, k=10: no significant difference (RMSE diff 0.1, 95% CI -0.3 to 0.5)
  pool 30, k=3: no significant difference (RMSE diff -1.4, 95% CI -3.8 to 1.1)
  pool 30, k=5: no significant difference (RMSE diff -2.0, 95% CI -4.6 to 0.4)
  pool 100, k=3: no significant difference (RMSE diff -0.3, 95% CI -2.5 to 2.2)
  pool 100, k=5: no significant difference (RMSE diff -0.6, 95% CI -3.6 to 2.4)
  pool 100, k=8: no significant difference (RMSE diff -2.5, 95% CI -6.0 to 0.9)
  pool 100, k=10: no significant difference (RMSE diff -2.7, 95% CI -6.2 to 0.6)
Spearman is lower than fixed order in 5 sigma 200 cells: pool 10 k=10, pool 100 k=3, pool 100 k=5, pool 100 k=8, pool 100 k=10.
Absolute errors are large for both arms because Elo with K=32 starts at 1000 and moves at most about 16 points per answer, so after 10 answers it has not caught up with abilities spread over +/-200.
```

What this says honestly: the production setting (sigma 200) is better than fixed order in 3 of 12 cells and not distinguishable in the other 9; the gains are small (about 1 to 4 RMSE points out of roughly 140 to 200). A narrower width (sigma 100) did better than the production width in this model. Elo with K=32 moves slowly, so after 10 answers both arms are still far from true ability (but better than predicting 1000 for everyone). Spearman is not uniformly better for adaptive mode.
