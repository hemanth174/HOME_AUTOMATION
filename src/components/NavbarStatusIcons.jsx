"use client";

const WifiSignalIcon = ({
  percentage,
  online,
  size = 15,
  signalColor = "var(--pg-success)",
  connecting = false,
}) => {
  if (!online) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${connecting ? "signal-connecting" : ""}`}
      >
        <line
          className="signal-line signal-line-cross"
          x1="1"
          y1="1"
          x2="23"
          y2="23"
        />
        <path
          className="signal-line signal-line-1"
          d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"
        />
        <path
          className="signal-line signal-line-2"
          d="M5 12.55a10.94 10.94 0 0 1 5.83-2.84"
        />
        <path
          className="signal-line signal-line-3"
          d="M8.53 16.11a6 6 0 0 1 6.95 0"
        />
        <line
          className="signal-line signal-line-4"
          x1="12"
          y1="20"
          x2="12.01"
          y2="20"
        />
      </svg>
    );
  }

  const showLevel2 = percentage > 25; // bottom arch
  const showLevel3 = percentage > 50; // middle arch
  const showLevel4 = percentage > 75; // top arch

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={signalColor}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-colors duration-500 ${connecting ? "signal-connecting" : ""}`}
    >
      <path
        className="signal-line signal-line-1 transition-opacity duration-300"
        d="M1.42 9a16 16 0 0 1 21.16 0"
        opacity={showLevel4 ? 1.0 : 0.2}
      />
      <path
        className="signal-line signal-line-2 transition-opacity duration-300"
        d="M5 12.55a11 11 0 0 1 14 0"
        opacity={showLevel3 ? 1.0 : 0.2}
      />
      <path
        className="signal-line signal-line-3 transition-opacity duration-300"
        d="M8.53 16.11a6 6 0 0 1 6.95 0"
        opacity={showLevel2 ? 1.0 : 0.2}
      />
      <line
        className="signal-line signal-line-4"
        x1="12"
        y1="20"
        x2="12.01"
        y2="20"
      />
    </svg>
  );
};
export { BoardSignalIcon, WifiSignalIcon };

const BoardSignalIcon = ({ percentage, online, size = 15, connecting = false }) => {
  if (!online) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${connecting ? "signal-connecting" : ""}`}
      >
        <line
          className="signal-line signal-line-cross"
          x1="1"
          y1="1"
          x2="23"
          y2="23"
        />
        <path
          className="signal-line signal-line-4"
          d="M4 20v-3"
          opacity="0.25"
        />
        <path
          className="signal-line signal-line-3"
          d="M9 20v-7"
          opacity="0.25"
        />
        <path
          className="signal-line signal-line-2"
          d="M14 20V9"
          opacity="0.25"
        />
        <path
          className="signal-line signal-line-1"
          d="M19 20V5"
          opacity="0.25"
        />
      </svg>
    );
  }

  const bar1 = true;
  const bar2 = percentage > 25;
  const bar3 = percentage > 50;
  const bar4 = percentage > 75;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#00ff41"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${connecting ? "signal-connecting" : ""}`}
    >
      <path
        className="signal-line signal-line-4"
        d="M4 20v-3"
        opacity={bar1 ? 1.0 : 0.25}
      />
      <path
        className="signal-line signal-line-3"
        d="M9 20v-7"
        opacity={bar2 ? 1.0 : 0.25}
      />
      <path
        className="signal-line signal-line-2"
        d="M14 20V9"
        opacity={bar3 ? 1.0 : 0.25}
      />
      <path
        className="signal-line signal-line-1"
        d="M19 20V5"
        opacity={bar4 ? 1.0 : 0.25}
      />
    </svg>
  );
};
