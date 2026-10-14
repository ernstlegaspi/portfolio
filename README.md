# Ernst Legaspi Portfolio

Vanilla HTML/CSS/JavaScript portfolio with a normal view and an interactive 3D workshop.

## Run Locally

Use any static server from the project root:

```bash
python3 -m http.server 3210 --bind 127.0.0.1
```

Then open:

```text
http://localhost:3210
```

The opening screen offers two choices:

- **Normal portfolio website**: the original portfolio and bouncing-target game.
- **3d portfolio**: an interactive room with Rew, TaskSeal, project, skills, and profile stations. Click objects or their floating labels to read the details. Drag to turn the camera, scroll to zoom, and use Reset view to return to the room overview.

Both buttons replace the selection screen in the same page, without changing the URL. There are no separate `normal.html` or `workshop.html` pages. Refreshing returns to the selection screen.

Switch between views with **3D portfolio** at the bottom of the normal sidebar, or **Normal portfolio** on the 3D room’s left wall. The wall switch is clickable and keyboard accessible, and remains available if 3D rendering fails. Each switch stops the outgoing view’s animations and event handlers before starting the next view.

The 3D view respects reduced-motion preferences and includes a motion control. It has no bottom station navigation; objects and their accessible floating labels open the content. If 3D rendering is unavailable, the station labels remain available.

Edit shared portfolio content in the `normal-template` element inside `index.html`; the workshop reads its details from that same template. The room interface lives in `workshop-template`. Run through an HTTP server rather than opening `index.html` directly so JavaScript modules load correctly.

The site has no frontend framework, package install, or build step. Each view's styles and scripts load only after that view is selected. Three.js 0.180.0 is vendored in `vendor/three/`, including its MIT license, and loads only for the 3D view. All workshop geometry and screen artwork are generated locally; the page has no external runtime dependencies.
