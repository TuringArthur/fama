import { type ComponentProps, splitProps } from "solid-js"

export interface TerminalProps extends ComponentProps<"div"> {
  pty: any
  autoFocus?: boolean
  onSubmit?: () => void
  onCleanup?: (pty: any) => void
  onConnect?: () => void
  onConnectError?: (error: unknown) => void
}

export const Terminal = (props: TerminalProps) => {
  const [local, others] = splitProps(props, ["pty", "class", "classList"])

  return (
    <div
      data-component="terminal"
      classList={{
        ...local.classList,
        "size-full flex items-center justify-center": true,
        [local.class ?? ""]: !!local.class,
      }}
      {...others}
    >
      <div class="text-center p-8">
        <div class="text-4xl mb-4">📋</div>
        <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          终端功能不可用
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          法码专注于法律文书处理和法律咨询服务，不包含终端功能。
          <br />
          如需执行命令行操作，请使用其他专业工具。
        </p>
      </div>
    </div>
  )
}
