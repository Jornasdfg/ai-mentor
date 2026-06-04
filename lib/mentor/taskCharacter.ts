import type { MentorTask } from "../mentorTypes";

// Karakter-onderscheid tussen Taken, Afspraken en Routine-taken.
// - "task"        : losse, flexibel planbare taak.
// - "appointment" : vaste afspraak met een eigen tijdstip (telt als bezet).
// - "routine"     : instance van een terugkerende routine — leeft alleen als planbaar
//                   blok in de planner, NIET in de takenlijst/Covey/agenda.

export function isRoutine(task: MentorTask): boolean {
  return (
    task.taskKind === "routine" ||
    task.isRecurringInstance === true ||
    !!task.recurrenceTemplateId
  );
}

export function isAppointment(task: MentorTask): boolean {
  return task.taskKind === "appointment";
}

// Taken die thuishoren in de takenlijst/Covey/agenda (dus géén routine-instances).
export function isListTask(task: MentorTask): boolean {
  return !isRoutine(task);
}
