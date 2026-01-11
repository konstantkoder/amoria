type DrawerControls = {
  setOpen: (open: boolean) => void;
  getOpen: () => boolean;
};

let controls: DrawerControls | null = null;

export function registerDrawerControls(next: DrawerControls) {
  controls = next;
}

export function openDrawer() {
  controls?.setOpen(true);
}

export function closeDrawer() {
  controls?.setOpen(false);
}

export function toggleDrawer() {
  if (!controls) return;
  controls.setOpen(!controls.getOpen());
}
