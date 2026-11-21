import {
  IconArrowRight,
  IconArrowUp,
  IconBook,
  IconBooks,
  IconFile,
  IconFileText,
  IconFileTypePdf,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconFolderSymlink,
  IconLogout,
  IconMarkdown,
  IconMicrophone,
  IconMicrophoneOff,
  IconPencil,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

const ICONS = {
  "arrow-right": IconArrowRight,
  "arrow-up": IconArrowUp,
  book: IconBook,
  books: IconBooks,
  file: IconFile,
  text: IconFileText,
  pdf: IconFileTypePdf,
  markdown: IconMarkdown,
  folder: IconFolder,
  "folder-open": IconFolderOpen,
  "folder-plus": IconFolderPlus,
  move: IconFolderSymlink,
  logout: IconLogout,
  microphone: IconMicrophone,
  "microphone-off": IconMicrophoneOff,
  pencil: IconPencil,
  pause: IconPlayerPauseFilled,
  play: IconPlayerPlayFilled,
  next: IconPlayerTrackNext,
  previous: IconPlayerTrackPrev,
  trash: IconTrash,
  close: IconX,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Shape = ICONS[name];
  return <Shape size={size} aria-hidden />;
}

type Sized = { size?: number };
const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const MicIcon = ({ size = 18 }: Sized) => (
  <svg {...stroke} strokeWidth={2} width={size} height={size} aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 17v4" />
  </svg>
);

export const WaveIcon = ({ size = 18 }: Sized) => (
  <svg {...stroke} strokeWidth={2.4} width={size} height={size} aria-hidden>
    <path d="M5 10v4" />
    <path d="M9 7v10" />
    <path d="M13 4v16" />
    <path d="M17 8v8" />
    <path d="M21 11v2" />
  </svg>
);

export const StopIcon = ({ size = 16 }: Sized) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export function AgentAvatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.47 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
