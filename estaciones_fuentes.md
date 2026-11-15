# Stations: why these 8 and where each value comes from

This document justifies every choice in [`estaciones.csv`](estaciones.csv). Each value is one of three kinds:

- **[NASA DATA]**: taken as is from an official NASA/JPL file or page.
- **[VERIFIED]**: we inferred it from the data and confirmed it with a published source.
- **[ASSUMPTION]**: we decided it for the simulation. It is presented to the judges as an assumption, as the spec asks.

## Method

1. **[NASA DATA]** We downloaded Perseverance's 708 official waypoints (sols 13 to 2022) from `M20_waypoints.json` (JPL). Each one has the sol, lon/lat, elevation and rover tilt.
2. We kept the 278 waypoints inside the spec's study area, the crater floor near the landing site and the delta front: lon 77.37–77.47°E, lat 18.41–18.48°N.
3. We looked for **the places where the rover stayed for many sols without moving**. A long stay points to science work (abrasion, sample core, analysis).
4. Each stay was matched, sol by sol, against [NASA's official sample table](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples) and the announcements for each campaign. **All 4 science stations match an official record.**
5. The 4 support stations (habitat, rover, shelter, relay) belong to a fictional crewed mission, placed on real waypoints chosen for their role.

## Why 8 stations and why these

- **The spec asks for 6 to 8 stations** and the types `habitat`, `rover`, `ciencia` (science), `muestreo` (sampling), `refugio` (shelter) and `comms`. With 8 there is one of each support type and 4 science stations.
- **They cover Perseverance's 3 science campaigns inside the area:** crater floor (Séítah), delta front (Amalik and Three Forks) and upper delta (Upper Fan). That way the demo tells Jezero's real geologic story: igneous floor rock → lake sediments → upper fan.
- **Walkable distances:** the farthest station (the upper delta) is 2.9 km from the habitat in a straight line. It fits the "small area of a few km²" the spec asks for.
- **The demo needs a station that can only be reached with more slope.** The upper delta meets this with a measured value: the rover reached a 20.3° tilt on the way up (sol 700).

## Station by station

### HAB — Octavia E. Butler habitat
- **Where:** Perseverance's landing site (February 18, 2021). Sol 13 waypoint: 77.45089°E, 18.44463°N, −2570 m. **[NASA DATA]**
- **Verification:** NASA places the site at 18.44°N 77.45°E, and named it after the writer Octavia E. Butler. **[VERIFIED]** ([JPL PIA24483](https://www.jpl.nasa.gov/images/pia24483-welcome-to-octavia-e-butler-landing/), [Wikipedia](https://en.wikipedia.org/wiki/Octavia_E._Butler_Landing))
- **Why here:** NASA chose this place as safe to land (flat terrain: the rover measured a 1.2° tilt). It is the logical place for a habitat.
- **Value 0, stay 0:** it is where the mission starts and ends, not a target. **[ASSUMPTION]**

### E1 — Delta front, Amalik outcrop
- **Where:** sol 565 waypoint: 77.40144°E, 18.45073°N, −2527 m. **[NASA DATA]**
- **Verification:** NASA took two sedimentary rock cores here from the **Amalik** outcrop: Shuyak (sealed on sol 575) and Mageik (taken on sol 579). According to the waypoints, the rover did not move between sols 557 and 592. NASA places Amalik "in the Enchanted Lake region, at the base of the Jezero delta". **[VERIFIED]** ([sample table](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples), [NASA blog on Amalik](https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/))
- **Why it matters:** the delta front holds the sediments of an ancient lake, the environment most likely to preserve signs of past life. It is the reason Perseverance went to Jezero. ([Mangold et al. 2021, *Science*, doi:10.1126/science.abl4051](https://earthsky.org/space/ancient-martian-lake-delta-floods-perseverance/))
- **Value 9:** the highest, because it is the central target of the real mission. **[GROUNDED ASSUMPTION]**
- **Note:** NASA sources disagree on Mageik's sol (the blog says sol 579, the table says sealed on sol 619). The sample may have been taken on 579 and sealed on 619. It does not change the location.

### M1 — South Séítah, Brac outcrop
- **Where:** sol 248 waypoint: 77.44302°E, 18.43396°N, −2569 m. **[NASA DATA]**
- **Verification:** NASA took two cores here from the **Brac** outcrop in "South Séítah": Salette (sol 262) and Coulettes (sol 271). According to the waypoints, the rover did not move between sols 248 and 278. **[VERIFIED]** ([sample table](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples))
- **Why it matters:** Brac is an igneous rock made of olivine crystals that piled up at the bottom of a magma chamber (an "olivine cumulate"). It helps date the crater and understand how the rock was altered by water. ([Liu et al. 2022, *Science* 377:1513](https://ntrs.nasa.gov/api/citations/20220012767/downloads/Liu%20et%20al.%202022%20olivine%20cumulate%20Seitah%20science.abo2756.pdf))
- **Value 8:** high, but one point below the delta because it is igneous rock (chronology) and not lake sediment (habitability). **[GROUNDED ASSUMPTION]**
- **12.3° tilt:** the highest the rover measured during that stay (sol 238). Séítah is rough terrain. **[NASA DATA]**

### M2 — Three Forks sample depot
- **Where:** sol 693 waypoint: 77.40844°E, 18.45342°N, −2545 m. **[NASA DATA]**
- **Verification:** NASA built the depot between **sol 653** (December 21, 2022) and **sol 690** (January 28, 2023), "on flat terrain near the base of the delta", with 10 tubes in a zigzag 5 to 15 m apart. The waypoints show exactly that: moves of a few meters between sols 652 and 693, on flat terrain (1.6° at most). **[VERIFIED]** ([JPL PIA25682](https://www.jpl.nasa.gov/images/pia25682-perseverances-three-forks-sample-depot-map/))
- **Why it matters:** it is the backup for returning samples to Earth. If the rover fails, a future mission picks up these tubes.
- **Value 7:** its importance is strategic, not new science: the tubes are already filled. The task "check the tubes" is a credible activity for a crewed mission. **[ASSUMPTION]**

### E2 — Upper delta (Upper Fan)
- **Where:** sol 709 waypoint: 77.40293°E, 18.46167°N, −2497 m. It is 48 m higher than the depot. **[NASA DATA]**
- **Verification:** the **Upper Fan** campaign (the mission's third) starts on **sol 708**, when the rover gets to the top of the fan front. **[VERIFIED]** ([NASA blog on the Upper Fan](https://science.nasa.gov/blog/up-and-soon-away-perseverance-continues-exploring-the-upper-fan/))
- **Why it matters:** the top holds the fan's youngest sediments. Compared with those at the front, they show how the water changed over time.
- **The slope (key for the demo):** on the way up (sols 698–709), the rover measured a **20.3° tilt on sol 700**. **[NASA DATA]** That is why the upper delta cannot be reached with a 15° limit and can with 20°: it is not a trick of ours.
- **Value 8:** important, but no core was taken at this exact spot (the first Upper Fan sample, Melyn, is from sol 749 and further ahead). **[GROUNDED ASSUMPTION]**
- **Open point:** a GSA 2023 abstract describes the climb through "Beagle Gap". We did not confirm whether our sol 698–707 waypoints belong to that stretch, so we do not use that name.

### REF — Shelter at the base of Hawksbill Gap
- **Where:** sol 437 waypoint: 77.40875°E, 18.45710°N, −2540 m. **[NASA DATA]**
- **Verification:** the climb up the Hawksbill Gap channel starts on **sol 441**, and this waypoint is the last stop before it, at the same place. **[VERIFIED]** ([NASA: Next stop Hawksbill Gap](https://science.nasa.gov/missions/mars-2020-perseverance/next-stop-hawksbill-gap/))
- **Why a shelter here:** at the foot of the delta scarp, the relief blocks part of the sky. That reduces radiation and protects from dusty wind (it is the "shielding" computed by the spec's dose model). It is also 220 m from the depot and 425 m from the upper delta, on the way up (straight-line distances). **[ASSUMPTION]**

### COM — Relay antenna, northern plain
- **Where:** sol 404 waypoint: 77.42576°E, 18.45932°N, −2548 m. **[NASA DATA]**
- **Verification:** it is a point of the **Rapid Traverse** (sols 379–409), the quick drive from the landing site to the delta. **[VERIFIED]** ([JPL Robotics, Rapid Traverse](https://robotics.jpl.nasa.gov/media/documents/2023-rapid-traverse.pdf))
- **Why a relay here:** it sits **in the middle**, between the habitat (1.7 km) and the delta front (1.5 km), on flat terrain (straight-line distances). That way it can have line of sight to both. **[ASSUMPTION]** Pedro computes the real line of sight with the DTM.
- **The photo** is from sol 405 because the sol 404 one was of the Sun (glare).

### ROV — Support rover, south floor
- **Where:** sol 135 waypoint: 77.45215°E, 18.43114°N, −2580 m, on the rover's real route south during the crater floor campaign. **[NASA DATA]**
- **Why here:** it is 540 m from Séítah in a straight line, to swap batteries and samples in the south while the habitat covers the north. **[ASSUMPTION]**

## Shared criteria

### Science value (0–10) **[GROUNDED ASSUMPTION]**

| Value | Criterion | Stations |
| --- | --- | --- |
| 9 | NASA took samples here **and** it is the lake environment, the central target of the mission | E1 |
| 8 | NASA took samples here (igneous rock), or it is the top of the fan, with no sample at that spot | M1, E2 |
| 7 | Strategic importance (sample backup), no new science | M2 |
| 1–2 | Logistics support | ROV, REF, COM |
| 0 | Mission origin | HAB |

### Stay time (minutes) **[ASSUMPTION]**
25 min for stratigraphy, 20 min for a panorama, 15 min to take or check samples and 10 min for support tasks. They are simulation values and live in a single place, so the team's statistics member can review them.

### Rover tilt as local slope **[NASA DATA, used as an approximation]**
The `inclinacion_rover_max_deg` column is the tilt measured by the rover (the waypoint's `tilt` field). It measures the ground where the rover was standing, not the slope of the whole path. Pedro computes each leg's real slope with the DTM. Meanwhile, the fake graph uses the tilt as an approximation.

### Photos **[NASA DATA]**
From the [Mars 2020 Raw Images API](https://mars.nasa.gov/mars2020/multimedia/raw-images/). The criteria:
- The same station and the same sol (or the next one).
- Left Navcam, full frame.
- The camera looking slightly down, for a first-person view.
- Photos showing mostly sky, the Sun or the rover deck were discarded by hand.

Credit: **NASA/JPL-Caltech**.

## What does not come from real data

- The habitat, rover, shelter and relay roles (the crewed mission is fictional).
- The science value, the stay time and the tasks.
- In `graph_fake.json`: THEMIS, the geologic unit, the alert zones and every edge attribute. Pedro's `graph.json` replaces those.

## Sources

- JPL, Mars 2020 waypoints: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
- NASA, Perseverance sample table: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples
- NASA, activities at the Amalik outcrop: https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/
- JPL, Three Forks depot map (PIA25682): https://www.jpl.nasa.gov/images/pia25682-perseverances-three-forks-sample-depot-map/
- NASA, Upper Fan: https://science.nasa.gov/blog/up-and-soon-away-perseverance-continues-exploring-the-upper-fan/
- NASA, Next stop Hawksbill Gap: https://science.nasa.gov/missions/mars-2020-perseverance/next-stop-hawksbill-gap/
- JPL Robotics, Rapid Traverse (2023): https://robotics.jpl.nasa.gov/media/documents/2023-rapid-traverse.pdf
- JPL, Octavia E. Butler Landing (PIA24483): https://www.jpl.nasa.gov/images/pia24483-welcome-to-octavia-e-butler-landing/
- Liu et al. 2022, *An olivine cumulate outcrop on the floor of Jezero crater, Mars*, Science 377:1513: https://ntrs.nasa.gov/api/citations/20220012767/downloads/Liu%20et%20al.%202022%20olivine%20cumulate%20Seitah%20science.abo2756.pdf
- Mangold et al. 2021, *Perseverance rover reveals an ancient delta-lake system and flood deposits at Jezero crater, Mars*, Science, doi:10.1126/science.abl4051
- Mars 2020 Raw Images: https://mars.nasa.gov/mars2020/multimedia/raw-images/
