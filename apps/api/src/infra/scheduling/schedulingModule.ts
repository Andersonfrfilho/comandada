import { createSchedulingModule, type SchedulingModule } from '@adatechnology/scheduling-module'

import { db } from '@/infra/database/connection'

const SCHEDULING_MAX_LOOKAHEAD_DAYS = 30

// One instance per process: the module holds no connection of its own, it borrows the host's.
export const schedulingModule: SchedulingModule = createSchedulingModule({
  db,
  config: {
    maxLookaheadDays: SCHEDULING_MAX_LOOKAHEAD_DAYS,
    defaultMinCancellationNoticeMinutes: 0,
  },
})
