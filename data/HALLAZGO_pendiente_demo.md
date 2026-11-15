# Finding: the spec's demo does not hold up with the real DTM

Date: Saturday the 14th, after computing the real graph with `data/`.

## What the spec says

The demo has three questions and the second one is:

> "What if I accept up to 20°?" → the system adds a station and says how much
> time it adds.

That depends on E2 (upper delta) being **unreachable** at 15° and reachable at 20°.
`graph_fake.json` meets it, because it uses a synthetic rule: each edge's slope
is the worst tilt the rover measured at its endpoints, plus noise.
So E2 carries its 20.3° and is blocked at 15°.

## What happens with the real terrain

With the 20 m CTX stereo DTM, **no station is blocked at 15°**. These are the
minimum limits measured, trying 3.0° to 30° in 0.5° steps:

| Station | Minimum limit to reach it from HAB | Real slope of the path |
| --- | --- | --- |
| ROV | 3.0° | 2.5° |
| M1 | 3.0° | 2.5° |
| COM | 3.5° | 3.5° |
| M2 | 4.5° | 4.5° |
| E1 | 4.5° | 4.5° |
| **E2** | **8.5°** | **8.3°** |
| REF | 12.5° | 12.3° |

At 15°, 20° and 25° the optimal mission is the same:

```
HAB → M2 → E2 → E1 → M1 → HAB      200.6 min, 7,491 m
```

All three versions of the graph have 56 edges. No station is skipped for
slope. The question "what if I accept 20°?" changes nothing.

## Why

Two reasons, both verified:

1. **The direct climb is steep, but there is a gentle detour.** The REF→E2
   profile reaches 19.7° and even 21.3° at the worst point of the box, and there
   is no way through under 10°. But between M2 and E2 the path's maximum is 10.5°,
   and there is a 12.26° corridor that reaches E2. The barrier is not continuous.
2. **The 20 m DTM smooths the relief.** The rover measured a 20.3° tilt on
   sol 700, but that is a local measurement over its wheelbase, not the average
   slope of a 700 m leg. At 20 m per pixel, a 3 m step gets averaged with its
   neighbors and disappears.

## What it is NOT

It is not an alignment or reprojection error: steps 40 and 60 check that
(stations on the raster, no offset, shared mesh, out ≠ back).
It is not a slope error either: p99 = 21.8° and there are 704 cells above 15°,
but they do not form a barrier between stations.

## Options for the team

| Option | Effect on the demo | Cost |
| --- | --- | --- |
| **A. Change the demo limits** to 8° and 12° | E2 fits at 12° and not at 8°; question 2 works | The team has to be told and `params.yaml` changed (it is Jeicoll's) |
| **B. Use the tilt the rover measured as a node constraint** | E2 is blocked with the real sol 700 value | It is NASA data, not made up; but it is not "path slope" |
| **C. Download a 1 m HiRISE DTM for the REF↔E2 corridor** | The real relief shows up | Download and time; the spec lists it as optional |
| **D. Change demo question 2** to one that does work (e.g. the time limit) | Zero technical risk | The slope contrast is lost |

**Recommendation:** A for the slope demo, with 8° and 12°. It is the only change
that keeps the story ("with more slope you reach the upper delta") and uses the
real terrain. If we prefer not to touch `params.yaml`, then D.

The numbers for option A, measured with this graph:

| Limit | Edges out of 56 | Stations reachable from HAB |
| --- | --- | --- |
| 8° | 30 | ROV, E1, M1, M2, COM — **E2 and REF are left out** |
| 10° | 42 | + E2 |
| 12° | 42 | + E2 |
| 15° | 56 | + REF (everything connected) |

With 8° and 12°, demo question 2 works again: at 8° the upper delta cannot be
reached, at 12° it can, and the system can say how much time it adds. The useful
jump is between 8° and 10°, so 8/12 leaves some margin.

## In the meantime

The real `graph.json` is generated with the three limits in `params.yaml` (15/20/25),
with no stations skipped for slope. It is correct and the engine accepts it: a
229.8 min mission in `engine.check_graph`. Dust alerts **do** change the route, so
demo question 3 works.
