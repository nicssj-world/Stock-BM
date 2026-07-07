import { Card, PageHeader } from '@/components/ui'

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#dce8e8] ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        eyebrow="BM Stock Control"
        title="ภาพรวม / Dashboard"
        description="กำลังโหลดข้อมูลล่าสุด"
      />
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="flex min-h-20 items-center gap-3 p-3">
            <SkeletonBlock className="size-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </section>
      <Card className="p-4">
        <SkeletonBlock className="h-12 w-full" />
      </Card>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <Card key={item} className="space-y-4 p-4">
            <SkeletonBlock className="size-9" />
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-7 w-14" />
          </Card>
        ))}
      </div>
    </div>
  )
}
