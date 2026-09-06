<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Seeder registry (guide §5.1). The starter seeds the canonical demo state;
 * packages append their own seeders HERE (one line per package), keeping
 * docs/hackathon/04-seed-demo.md numbers intact.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DemoSeeder::class,
            CoursesPackageSeeder::class, // H05
            // H11: InternshipPackageSeeder::class,
            // …
        ]);
    }
}
