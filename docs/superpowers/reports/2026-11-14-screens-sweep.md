# Screens sweep after the lighter Today (2026-11-14)

Method: Timetable, Subject Hubs, Tasks, Study Vault, Daily Briefing and Settings captured at 360, 390, 820, 1280 and 1440px wide with the busy seed (light theme, Thursday 11:20 AM). Screenshots are not committed. Looked at 390 and 1280 by eye; all five widths measured (sideways scroll, controls under 44px high, smallest text).

Measured: no sideways scroll on any screen at any width. Smallest text is 12px everywhere except the Subject Hub ring labels (8.5px).

| Screen | Width | Mismatch with Today | Suggested fix | Size |
|---|---|---|---|---|
| Timetable | 360-390 | Each class is three lines: Present / Absent / edit sit on a line of their own (Today moved them to the status line). "Mark all 2 ended classes Present" is a full-width outlined box. | Put the marks on the status line as Today does; make "Mark all" a text control like "I was at all N". | M |
| Timetable | 820-1440 | "Present" is a boxed, filled button; Today's is a compact outlined pill. Same word, two looks. | Reuse the Today pill style for the mark controls. | S |
| Subject Hubs | all | Ring labels ("OTH", "DBMS") are 8.5px, under the 12px floor Today keeps. The "Duplicate subject cards found" banner shows with this seed (may come from the seed's link list, not checked). | Raise ring label size or show a short code only; check the banner against real data before touching it. | S |
| Tasks | 1280-1440 | The list stops at about 760px of 936px and leaves an empty strip on the right under the add box; the subject chips are cut off ("Probab…"). | Let the list use the full column; wrap or scroll the chips with a visible edge. | S |
| Tasks | 360-820 | Checkbox boxes in "Late" look larger than in "Next 7 days". | Same checkbox size in every group. | S |
| Study Vault | all | Each subject row has a small empty grey pill beside "…" that reads as a broken element. The rest of the page is empty space. | Remove the empty pill or fill it with the item count; keep the row otherwise. | S |
| Daily Briefing | 1280-1440 | Content uses about 720px of 936px; empty strip on the right. Type and row weight match Today. | Let it use the column width, or centre it. | S |
| Settings | 360-820 | About 6,200px tall on a phone with 37 controls under 44px high (44 on laptop). Much denser than Today: small labels, many controls per row. | Fold sections (as Tasks folds "Older"), raise control height to 44px. | L |

Recommended order: (1) Timetable marks on the status line, because it is the same job as Today and the most visible difference; (2) Tasks and Briefing full-width columns and the Vault empty pill (all S, one PR); (3) Subject Hub ring labels; (4) Settings, last, as its own plan.
