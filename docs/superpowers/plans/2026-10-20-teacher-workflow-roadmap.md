# Teacher workflow roadmap

Requested by the host on 2026-10-20. Five phases (0 to 4); each ships working software on its own and ends with the full suite green. Choices marked **(my call)** were not specified and are open to change.

## Where things live (so the dashboard stays simple)

| Place                        | Holds                                              | Change                         |
| ---------------------------- | -------------------------------------------------- | ------------------------------ |
| Host nav: **Quizzes**        | quiz cards                                         | unchanged                      |
| Host nav: **Question bank**  | questions, now grouped into **Modules**            | modules added (Phase 1)        |
| Host nav: **Students**       | reusable **Groups**                                | new page (Phase 3)             |
| Quiz editor, left column     | title, type, access, **Delivery** (shuffle, pools) | Delivery block added (Phase 2) |
| Quiz editor, right column    | ordered question list with drag handles, images    | reorder + image (Phase 1)      |
| Quiz **History** → a session | scores, proctoring, **each student's performance** | per-student detail (Phase 4)   |
| Student **My results**       | their own result for each assessment               | per-attempt detail (Phase 4)   |

Nothing new is added to the dashboard home. Every feature sits inside the screen where the host already does that job.

## Phase 0: keep the free server awake

Render free services sleep after 15 idle minutes and take about a minute to wake, which makes the first student of a session wait or fail.

- A scheduled GitHub Action calls `/health` every 10 minutes. GitHub may delay runs and pauses schedules after 60 days without repo activity, so the README also names a second pinger (cron-job.org or UptimeRobot, both free) as a backup **(my call)**.
- 750 free hours a month covers one service running all month.
- Done when: the workflow file exists, is valid, and the README explains the two options and the limits. Real effect can only be confirmed after it is pushed.

## Phase 1: authoring

1. **Modules instead of per-question topics.** A module is a named group in the question bank (Module 1, Module 2, …). A question belongs to one module; its topic is the module name. The topic field leaves the question form; the CSV `topic` column becomes optional (an unlisted topic goes to "Unsorted"). Existing questions keep their topic and become modules of that name, so mastery tracking continues to work unchanged. **(my call: topic stays as a stored column; modules are derived from it, so no data migration risk.)**
2. **Reorder questions** in the quiz editor by drag handle, with Move up and Move down buttons so it works on keyboard and phone. Order is saved; live and exam sessions use it unless shuffle is on.
3. **Image on a question.** A new optional "Add an image" control in the question form: JPG, PNG or WebP, up to 2 MB, with an alt-text field (required when an image is set, for accessibility). Stored in a new Storage bucket, shown to the host in the list and to students in live and exam views. One image per question **(my call)**.

## Phase 2: delivery

1. **Shuffle** (Delivery block, off by default): question order per student, and option order per student. The order is derived from a seed stored per participant, so a reconnect shows the same order and the report shows what each student saw. Live (everyone together) sessions keep one shared order; shuffle applies to exams and self-paced sessions **(my call)**.
2. **Question pools.** In Delivery, "Draw N questions at random from module X" rules, any number of them, plus "always include" for fixed questions. Each student gets their own draw, stored with their seed. The editor shows how many questions a student will see in total.

## Phase 3: reusable student groups

A **Students** page lists the host's groups; a group holds names and optional emails, filled by paste or CSV exactly as in the invite panel. In the invite panel, step 1 gains "Add a saved group". Adding a group to a quiz copies its members into that session's roster; later edits to the group do not change running sessions. Groups are private to their host.

## Phase 4: results and performance

Decided by the host: **no PDF, no emailed or sent results.** Results are only ever viewed inside the app.

- **Student:** **My results** shows their own attempts. Opening one shows their score, time taken and their answers question by question. Whether the correct answers are shown is a per-quiz switch, off for exams by default **(my call)**. A student sees only their own data.
- **Host:** the session page in **History** shows each student's result and performance: score, rank, time, accuracy per question and per module, and the proctoring events and device already collected. Hosts see only their own quizzes' students.
- First step of the phase is to list what these two screens already show, then add only what is missing.

## Order and sizes

0 small (done), 1 large, 2 large, 3 medium, 4 small to medium. Phases 1 and 2 touch the same question model, so they go in that order.
