import { Weekday } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

interface OutputDto {
  workoutPlans: Array<{
    id: string;
    name: string;
    isActive: boolean;
    workoutDays: Array<{
      id: string;
      name: string;
      weekday: Weekday;
      isRest: boolean;
      estimatedDurationInSeconds: number;
      exercisesCount: number;
    }>;
  }>;
}

export class ListWorkoutPlans {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlans = await prisma.workoutPlan.findMany({
      where: { userId: dto.userId },
      orderBy: { createdAt: "desc" },
      include: {
        workoutDays: {
          include: {
            _count: {
              select: { exercises: true },
            },
          },
        },
      },
    });

    return {
      workoutPlans: workoutPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        isActive: plan.isActive,
        workoutDays: plan.workoutDays.map((day) => ({
          id: day.id,
          name: day.name,
          weekday: day.weekday,
          isRest: day.isRestDay,
          estimatedDurationInSeconds: day.estimatedDurationInSeconds,
          exercisesCount: day._count.exercises,
        })),
      })),
    };
  }
}
