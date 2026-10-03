<?php

namespace App\Http\Resources;

use App\Models\EmailMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Sent-mailbox row for the administration inbox (contract §2 — Powiadomienia,
 * GET /admin/emails). Everything is `status: simulated` during the hackathon.
 *
 * Odnośnik z tokenem (zaproszenie, aktywacja) jest w podglądzie zamaskowany
 * dla każdej roli ({@see LinkTokenMask}): token należy wyłącznie do adresata.
 *
 * @mixin EmailMessage
 */
class EmailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'to_email' => $this->to_email,
            'subject' => $this->subject,
            'body_html' => LinkTokenMask::apply($this->body_html),
            'status' => $this->status,
            'sent_at' => $this->sent_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
        ];
    }
}
