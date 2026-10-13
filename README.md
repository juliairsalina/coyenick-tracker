# coyenick-tracker — My Cats 🐾

A simple, mobile-friendly cat care app for the whole family. It has four tabs, one **+ Add Record** button and one calendar that shows everything.

It is an installable web app (PWA). It has no build step and no dependencies, works offline, and stores data on the phone.

## Run it

```bash
npm start        # http://localhost:8080
npm test         # unit tests for scheduling, reminders and health logic
```

To use it on a phone, host the folder on any static host (GitHub Pages, Netlify, etc.) and open it. Then choose **Add to Home Screen**. Tap **Try with sample cats** on the welcome screen to see it filled in.

## What's in v1

| Tab | What it does |
| --- | --- |
| **Home** | Today's tasks and medication doses, overdue items, the next 14 days, your cats. Tap **Done / Taken / Skip / Later** right in the list. |
| **Calendar** | One colour-coded month view: vaccines, flea (kutu), deworming (cacing), medication, vet visits, to-dos, monthly weigh-ins and custom events. Filter by cat. Export to your phone calendar. |
| **Records** | Searchable history filtered by cat, category and date. A **Trends** tab shows weight over time, asthma episodes per month, appetite problems and other symptoms. Includes a monthly **Report** you can save as PDF. |
| **Cats** | A profile per cat: photo, birthday (age is calculated), sex, breed, neutered/spayed, allergies, conditions and vet info. Also current weight with history, current and past medication, vaccine/flea/deworm history, the monthly photo gallery with side-by-side **Compare**, and recent records. |

**Quick Add** (the + button) is grouped into **Health / Care / Daily**. Pick a category, tap a cat, tap a status, and save. The date is filled in for you. The last cat used, last weight, last food brand and last clinic are pre-filled too. Notes and photos are optional.

**Safety prompts.** Some entries open a "contact a vet" screen instead of only being logged:

- difficulty urinating or not peeing
- breathing trouble, severe asthma, or an episode longer than 5 minutes
- seizures
- not eating
- blood in stool
- a swollen eye

The screen has a one-tap call button if a vet phone number is saved.

**Medication.** Enter the name, dose, times per day, start and end date, and turn the reminder on or off. Each dose is marked **Taken** or **Skipped**. A dose that isn't marked by the end of its day shows as **Missed**. Stopping a medication keeps its history.

**Vaccines, flea and deworming.** Enter the name, date, repeat schedule and reminders. When you tap **Done**, the app asks for the date it was actually given and saves that to history. The next date is scheduled automatically.

**Reminders.** Choose 2 weeks before, 1 week before, 1 day before and/or on the day, for each event.
- **Phone notifications** fire for doses and reminders while the app is open or installed.
- **Email:** Settings → *Email me the next 2 weeks* opens your mail app with the full schedule.
- **Calendar export (.ics):** imports into Google, Apple or Outlook calendar. Their alerts and email notifications then work even when the app is closed.

**Keeping history.** Editing a cat never erases old records. Weight is a history of entries, and the profile shows the latest one.

## Limits of this first version (good next steps)

- **Automatic emails and background push** need a small server. This version uses the mail app and calendar export instead.
- **Family sharing** works by exporting a backup and importing it on another phone (Settings). Live shared editing needs a backend with accounts, for example Supabase or Firebase.
- Data lives in the browser's storage on one device. Photos are shrunk before saving, but export a backup now and then.
- The app is in English, with Malay hints (taik, mata, kutu, cacing). A full language switch can be added later.

## Code layout

```
index.html, css/styles.css     shell + mobile-first styles (light/dark, print)
js/model.js                    pure logic: schedules, doses, reminders, urgent symptom rules
js/store.js                    localStorage state + all mutations, sample data
js/forms.js                    Quick Add and every add/edit sheet
js/views/*.js                  Home, Calendar, Records, Cats/profile, Report, Settings
js/notify.js                   notifications, email digest, .ics export
sw.js, manifest.webmanifest    offline + installable
test/model.test.js             node --test
```
