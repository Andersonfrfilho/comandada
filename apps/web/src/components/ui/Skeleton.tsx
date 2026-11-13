export type SkeletonProps = {
  readonly className?: string
}

export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps): JSX.Element {
  return <div className={`animate-pulse motion-reduce:animate-none bg-gray-200 rounded-lg ${className}`} />
}

export type SkeletonListProps = {
  readonly rows?: number
  readonly rowClassName?: string
}

export function SkeletonList({ rows = 4, rowClassName = 'h-16 w-full' }: SkeletonListProps): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`${rowClassName} rounded-xl`} />
      ))}
    </div>
  )
}
