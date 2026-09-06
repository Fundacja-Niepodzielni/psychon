<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\H14\DocumentIssuer;
use Illuminate\Console\Command;
use Throwable;

/**
 * Test-only entry point: `tests/Feature/H14/ConcurrentDocumentNumberTest`
 * shells out to this command from several OS processes at once to prove
 * DocumentIssuer::issue() serializes numbering under real concurrency —
 * a single PHPUnit process cannot open two overlapping DB transactions.
 */
class IssueDocumentCommand extends Command
{
    protected $signature = 'documents:issue {userId} {type}';

    protected $description = 'Wydaje dokument dla użytkownika (narzędzie testu współbieżności H14)';

    public function handle(): int
    {
        $user = User::find((int) $this->argument('userId'));

        if ($user === null) {
            $this->error('user_not_found');

            return self::FAILURE;
        }

        try {
            $document = DocumentIssuer::issue($user, (string) $this->argument('type'));
        } catch (Throwable $e) {
            $this->error('issue_failed:'.$e->getMessage());

            return self::FAILURE;
        }

        $this->line($document->number);

        return self::SUCCESS;
    }
}
