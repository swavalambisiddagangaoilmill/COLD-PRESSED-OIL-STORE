import { Download } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "ss-oil-mill-install-dismissed";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "true") return undefined;
    let timer;
    const beforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      timer = window.setTimeout(() => setVisible(true), 2200);
    };
    const installed = () => { setVisible(false); setInstallEvent(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", installed); };
  }, []);

  if (!visible || !installEvent) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
    setInstallEvent(null);
  };

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome !== "accepted") localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
    setInstallEvent(null);
  };

  return (
    <aside role="dialog" aria-label="Install Swavalambi Siddaganga Oil Mill app" className="fixed inset-x-3 bottom-4 z-[140] mx-auto max-w-md border border-ink/15 bg-white p-4 shadow-soft sm:inset-x-auto sm:right-5 sm:mx-0">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand text-white"><Download size={18} /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold text-ink">Install our app</p><p className="mt-1 text-sm leading-5 text-ink/55">Add the store to your device for quicker access.</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={dismiss} className="h-10 rounded-md border border-ink/15 bg-white px-4 text-sm font-semibold text-ink hover:border-leaf hover:text-leaf">Not Now</button>
        <button type="button" onClick={install} className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-leaf">Install App</button>
      </div>
    </aside>
  );
}
