import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const filter = createUniqueId()
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720.002 129.001"
      fill="none"
      preserveAspectRatio="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.16" filter={`url(#${filter})`} mask={`url(#${mask})`}>
        <path
          fill="currentColor"
          d="M 203.0778 18.4297 H 184.6163 V 110.5726 H 203.0778 V 18.4297 Z M 258.4625 18.4297 H 184.6163 V 36.8912 H 258.4625 V 18.4297 Z M 258.4625 60.8911 H 184.6163 V 79.3526 H 258.4625 V 60.8911 Z M 295.3855 36.8912 H 276.924 V 110.5726 H 295.3855 V 36.8912 Z M 350.7702 36.8912 H 332.3087 V 110.5726 H 350.7702 V 36.8912 Z M 332.3087 18.4297 H 295.3855 V 36.8912 H 332.3087 V 18.4297 Z M 350.7702 64.5011 H 276.924 V 82.9626 H 350.7702 V 64.5011 Z M 387.6932 18.4297 H 369.2317 V 110.5726 H 387.6932 V 18.4297 Z M 443.0779 18.4297 H 424.6164 V 110.5726 H 443.0779 V 18.4297 Z M 443.0779 18.4297 H 369.2317 V 36.8912 H 443.0779 V 18.4297 Z M 387.6932 36.8912 L 406.1547 36.8912 L 415.3856 75.5583 L 396.9241 75.5583 Z M 406.1549 36.8912 L 424.6164 36.8912 L 415.3856 75.5583 L 396.9241 75.5583 Z M 480.0009 36.8912 H 461.5394 V 110.5726 H 480.0009 V 36.8912 Z M 535.3856 36.8912 H 516.9241 V 110.5726 H 535.3856 V 36.8912 Z M 516.9241 18.4297 H 480.0009 V 36.8912 H 516.9241 V 18.4297 Z M 535.3856 64.5011 H 461.5394 V 82.9626 H 535.3856 V 64.5011 Z"
        />
      </g>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="0" x2="360" y2="112" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <filter
          id={filter}
          x="0"
          y="0"
          width="720.002"
          height="130.001"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="1" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow_4938_16028" />
        </filter>
      </defs>
    </svg>
  )
}
