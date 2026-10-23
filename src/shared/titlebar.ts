/**
 * Title bar geometry, shared by the window and the renderer.
 *
 * macOS draws its window controls (traffic lights) over the web content, so
 * the renderer keeps that corner of the title bar free. The controls start at
 * TRAFFIC_LIGHT_X and the three buttons end at TRAFFIC_LIGHT_END; the title
 * bar content starts at TITLEBAR_LEFT, clear of them.
 */
export const TRAFFIC_LIGHT_X = 12
export const TRAFFIC_LIGHT_Y = 11
/** Right edge of the three window-control buttons, in CSS pixels. */
const TRAFFIC_LIGHT_END = 78
/** Where the title bar content starts: past the controls, with air. */
export const TITLEBAR_LEFT = TRAFFIC_LIGHT_END + 20
