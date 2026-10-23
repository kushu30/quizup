# What QuizUp emails, and when

These are the real messages, produced by the same code the server uses, filled with sample names. Each one is shown as plain text (what appears in mail apps that do not show formatting).

QuizUp sends exactly two kinds of email, and only when a person presses a button. It never sends on its own, never emails a list of tokens to the host, and never sends anything unless email is set up (see "Email (tokens and host access)" in the README).

| Situation                    | Who gets it                               | Sent when                                                                                                            |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Access token                 | One invited student, only their own token | The host presses **Email tokens** or a row's **Email**, checks the preview and presses Send                          |
| Host access (no account yet) | The new host                              | An admin adds the address to the host allowlist and QuizUp finds no account for it; the mail asks them to create one |
| Host access (has an account) | The existing user                         | The address already has an account, which is upgraded to host; the mail asks them to sign in                         |

Sign-up confirmation and password reset emails are not sent by QuizUp. Supabase sends those itself, with its own settings.

All messages are sent from `MAIL_FROM_NAME <MAIL_FROM>` (for example "QuizUp <quizup@yourdomain.org>"), and replies go to `MAIL_REPLY_TO` if you set one.

## 1. An invited student gets their access token (quiz with an institution brand)

**Sent when:** A host presses Email tokens, or Email next to one student, in the Invited students panel, and sends from the preview dialog. The header shows the institution logo and name in the institution colour, with Powered by QuizUp.

**To:** asha.rao@example.com
**Subject:** Your access to Database systems mid-term

```text
Hello Asha Rao,

You have been invited to take Database systems mid-term. Use your personal link below to join. It works for you only.

Open your personal link:
https://quizup.kushu30.me/join/K7M2QX#token=K5B8J-AH9JV

Or go to https://quizup.kushu30.me/join and enter:
Join code: K7M2QX
Access token: K5B8J-AH9JV

This link and token are personal to you. Please do not share them. Each admits one person, and your host can see if one is used on another device.

Optional: create a free account
A QuizUp account keeps your results in one place. Sign in before you join and each assessment appears under My results, with your score and rank. You can take this assessment without one.
Create an account: https://quizup.kushu30.me/login?mode=sign-up&email=asha.rao%40example.com

Sent on behalf of Dayananda Sagar College of Engineering using QuizUp.
```

## 2. An invited student gets their access token (quiz without branding)

**Sent when:** Same dialog; the quiz has no institution, so only the QuizUp logo is shown. This student already has a QuizUp account, so the mail asks them to sign in before joining instead of inviting them to create one.

**To:** ben.cole@example.com
**Subject:** Your access to Fractions review

```text
Hello Ben Cole,

You have been invited to take Fractions review. Use your personal link below to join. It works for you only.

Open your personal link:
https://quizup.kushu30.me/join/P4T9WD#token=QD7MN-X2K4R

Or go to https://quizup.kushu30.me/join and enter:
Join code: P4T9WD
Access token: QD7MN-X2K4R

This link and token are personal to you. Please do not share them. Each admits one person, and your host can see if one is used on another device.

You already have a QuizUp account
Sign in before you join and this result is saved under My results.
Sign in: https://quizup.kushu30.me/login?email=ben.cole%40example.com

Sent by QuizUp.
```

## 3. A bright brand colour stays readable

**Sent when:** The institution colour is bright yellow, so the header switches to dark text and the dark QuizUp logo. The institution here has a name but no logo.

**To:** priya.nair@example.com
**Subject:** Your access to Operating systems quiz

```text
Hello Priya Nair,

You have been invited to take Operating systems quiz. Use your personal link below to join. It works for you only.

Open your personal link:
https://quizup.kushu30.me/join/B6H3ZE#token=M8C2F-PW5TG

Or go to https://quizup.kushu30.me/join and enter:
Join code: B6H3ZE
Access token: M8C2F-PW5TG

This link and token are personal to you. Please do not share them. Each admits one person, and your host can see if one is used on another device.

Optional: create a free account
A QuizUp account keeps your results in one place. Sign in before you join and each assessment appears under My results, with your score and rank. You can take this assessment without one.
Create an account: https://quizup.kushu30.me/login?mode=sign-up&email=priya.nair%40example.com

Sent on behalf of Lincoln High School using QuizUp.
```

## 4. The host wrote their own subject and message

**Sent when:** In the dialog the host replaced the default wording using placeholders. Each student gets their own values.

**To:** chen.wei@example.com
**Subject:** Dayananda Sagar College of Engineering: Database systems mid-term on Friday

```text
Dear Chen Wei,

The mid-term takes place on Friday at 10:00 in Lab 3. Please bring a charged laptop and your college ID.

Your personal link is https://quizup.kushu30.me/join/K7M2QX#token=W3R7T-NB6YH. Open it when the exam starts.

Open your personal link:
https://quizup.kushu30.me/join/K7M2QX#token=W3R7T-NB6YH

Or go to https://quizup.kushu30.me/join and enter:
Join code: K7M2QX
Access token: W3R7T-NB6YH

This link and token are personal to you. Please do not share them. Each admits one person, and your host can see if one is used on another device.

Sent on behalf of Dayananda Sagar College of Engineering using QuizUp.
```

## 5. A new host, who has no account yet, is asked to create one

**Sent when:** An admin adds meera.iyer@school.org to the host allowlist and QuizUp finds no account for that address. The button opens the sign-up page with the address filled in and locked; the new host chooses a name and a password and lands on the host dashboard. Creating the account is required to use host access.

**To:** meera.iyer@school.org
**Subject:** Create your QuizUp host account

```text
You have been given host access to QuizUp.

As a host you can:
- Write questions, import a spreadsheet or review AI drafts
- Run live quizzes, adaptive quizzes and timed exams
- Invite students with personal access tokens and review results, feedback and exports

To use it, create your account with this email address (meera.iyer@school.org). Host access is tied to the same email address, so please do not use another. You choose your name and a password on the next page.
https://quizup.kushu30.me/login?mode=sign-up&email=meera.iyer%40school.org&invite=host

If you were not expecting this, you can ignore this email.

Questions: kushagra.shukla2005@gmail.com
```

## 6. An existing user who is given host access is asked to sign in

**Sent when:** An admin adds arjun.mehta@school.org, who already has a QuizUp account (for example as a student). The account is upgraded to host straight away and the button opens sign-in with the address filled in. The admin can also press Email again next to an address.

**To:** arjun.mehta@school.org
**Subject:** You can now host quizzes on QuizUp

```text
Your account now has host access.

As a host you can:
- Write questions, import a spreadsheet or review AI drafts
- Run live quizzes, adaptive quizzes and timed exams
- Invite students with personal access tokens and review results, feedback and exports

Sign in with this email address to open your dashboard.
https://quizup.kushu30.me/login?email=arjun.mehta%40school.org&invite=host

If you were not expecting this, you can ignore this email.

Questions: kushagra.shukla2005@gmail.com
```

## Edge cases

- **Preview and test first.** The dialog shows the exact formatted email for a real student, and **Send a test to me** sends a copy to the host's own address with an example token (the subject starts with [Test]). Unknown placeholders are refused before anything is sent.
- **Odd characters in names or titles.** Anything a host types is escaped in the formatted version, and line breaks are removed from the subject, so a name like `<b>Asha</b>` shows as literal text and can never add a header or a link.
- **Account invitations.** QuizUp checks its user records for each address before sending. Hosts are told they must create (or sign in to) an account with that exact address. Students are told, with the benefits, that an account is optional: signed-in students see their past results under My results, and they can take the assessment without one. If the lookup fails, the mail uses the create-account wording and is still sent.
- **A student without an email address.** They are skipped and the panel says how many; nothing is sent for them.
- **A student who needs a new token first.** After a server restart the server no longer holds plain tokens, so the panel asks the host to press **New token** before emailing.
- **A provider error.** Other students still get their mail; the panel lists the names that failed. The error shown never contains your SMTP password.
- **Email not set up.** The email buttons are hidden. Adding a host still works and the Admin page says the welcome email was not sent.
