import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { Weekday } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const DAY_INDEX_TO_WEEKDAY: Record<number, Weekday> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

interface InputDto {
  userId: string;
  date: string;
}

interface TodayWorkoutDay {
  workoutPlanId: string;
  id: string;
  name: string;
  isRest: boolean;
  weekDay: string;
  estimatedDurationInSeconds: number;
  coverImageUrl?: string;
  exercisesCount: number;
}

interface ConsistencyEntry {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: TodayWorkoutDay | null;
  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyEntry>;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const date = dayjs.utc(dto.date);
    const weekStart = date.startOf("week");
    const weekEnd = date.endOf("week");

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: { exercises: true },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Active workout plan not found");
    }

    const todayWeekday = DAY_INDEX_TO_WEEKDAY[date.day()];
    const todayWorkoutDay = workoutPlan.workoutDays.find(
      (d) => d.weekday === todayWeekday,
    );

    const todayWorkoutDayResponse: TodayWorkoutDay | null = todayWorkoutDay
      ? {
          workoutPlanId: workoutPlan.id,
          id: todayWorkoutDay.id,
          name: todayWorkoutDay.name,
          isRest: todayWorkoutDay.isRestDay,
          weekDay: todayWorkoutDay.weekday,
          estimatedDurationInSeconds:
            todayWorkoutDay.estimatedDurationInSeconds,
          coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
          exercisesCount: todayWorkoutDay.exercises.length,
        }
      : null;

    const weekSessions = await prisma.workoutSession.findMany({
      where: {
        workoutPlanId: workoutPlan.id,
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
    });

    const consistencyByDay: Record<string, ConsistencyEntry> = {};

    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, "day");
      const dayStr = day.format("YYYY-MM-DD");

      const daySessions = weekSessions.filter(
        (s) => dayjs.utc(s.startedAt).format("YYYY-MM-DD") === dayStr,
      );

      const started = daySessions.length > 0;
      const completed = daySessions.some((s) => s.completedAt !== null);

      consistencyByDay[dayStr] = {
        workoutDayCompleted: completed,
        workoutDayStarted: started,
      };
    }

    const workoutDaysByWeekday = new Map(
      workoutPlan.workoutDays.map((d) => [d.weekday, d]),
    );

    const streak = await this.calculateStreak(
      date,
      workoutPlan.id,
      workoutDaysByWeekday,
    );

    return {
      activeWorkoutPlanId: workoutPlan.id,
      todayWorkoutDay: todayWorkoutDayResponse,
      workoutStreak: streak,
      consistencyByDay,
    };
  }

  private async calculateStreak(
    fromDate: dayjs.Dayjs,
    workoutPlanId: string,
    workoutDaysByWeekday: Map<
      string,
      { id: string; isRestDay: boolean; weekday: string }
    >,
  ): Promise<number> {
    let streak = 0;
    let currentDate = fromDate;
    const maxLookback = 365;

    for (let i = 0; i < maxLookback; i++) {
      const weekday = DAY_INDEX_TO_WEEKDAY[currentDate.day()];
      const workoutDay = workoutDaysByWeekday.get(weekday);

      if (!workoutDay) {
        currentDate = currentDate.subtract(1, "day");
        continue;
      }

      if (workoutDay.isRestDay) {
        streak++;
        currentDate = currentDate.subtract(1, "day");
        continue;
      }

      const dayStart = currentDate.startOf("day").toDate();
      const dayEnd = currentDate.endOf("day").toDate();

      const completedSession = await prisma.workoutSession.findFirst({
        where: {
          workoutPlanId,
          workoutDayId: workoutDay.id,
          startedAt: { gte: dayStart, lte: dayEnd },
          completedAt: { not: null },
        },
      });

      if (completedSession) {
        streak++;
        currentDate = currentDate.subtract(1, "day");
      } else {
        break;
      }
    }

    return streak;
  }
}
