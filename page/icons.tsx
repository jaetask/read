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
