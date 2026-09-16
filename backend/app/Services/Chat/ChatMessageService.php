<?php

namespace App\Services\Chat;

use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\Notify;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Zapisuje wiadomość i powiadamia każdego odbiorcę INNEGO niż autor —
 * dokładnie tylu wierszy w `notifications`, ilu jest takich odbiorców.
 * Jeden mechanizm powiadomień: `Notify::send` (§1 kontraktu), żaden drugi
 * nie powstaje obok.
 *
 * Typ `message.received` NIE figuruje jeszcze w rejestrze §3.1 kontraktu —
 * czat jest tu nowym modułem, rejestr typów powiadomień wymaga uzupełnienia.
 */
final class ChatMessageService
{
    public function send(MessageThread $thread, User $sender, string $body): Message
    {
        return DB::transaction(function () use ($thread, $sender, $body): Message {
            $message = Message::query()->create([
                'thread_id' => $thread->id,
                'sender_id' => $sender->id,
                'body' => $body,
            ]);

            $thread->touch();

            foreach ($this->recipients($thread, $sender) as $recipient) {
                Notify::send(
                    $recipient,
                    'message.received',
                    'Nowa wiadomość',
                    Str::limit($body, 140),
                    "/panel/wiadomosci/{$thread->id}",
                );
            }

            return $message;
        });
    }

    /**
     * Wszyscy widzący wątek poza autorem: dla `individual` druga strona
     * pary; dla `group` prowadzący plus aktualnie aktywny zespół —
     * członkostwo grupy czytane z `supervisor_assignments`, tak jak
     * w `ChatThreadQuery`, nie duplikowane osobną definicją.
     *
     * @return Collection<int, User>
     */
    private function recipients(MessageThread $thread, User $sender): Collection
    {
        if ($thread->isIndividual()) {
            $other = (int) $thread->volunteer_id === $sender->id
                ? $thread->supervisor
                : $thread->volunteer;

            return collect($other !== null ? [$other] : []);
        }

        /** @var Collection<int, User|null> $recipients */
        $recipients = collect();

        if ($thread->supervisor_id !== null && (int) $thread->supervisor_id !== $sender->id) {
            $recipients->push($thread->supervisor);
        }

        SupervisorAssignment::query()
            ->where('supervisor_id', $thread->supervisor_id)
            ->whereNull('unassigned_at')
            ->where('volunteer_id', '!=', $sender->id)
            ->with('volunteer')
            ->get()
            ->each(function (SupervisorAssignment $assignment) use ($recipients): void {
                /** @var User|null $volunteer */
                $volunteer = $assignment->volunteer;
                $recipients->push($volunteer);
            });

        return $recipients->filter()->unique('id')->values();
    }
}
