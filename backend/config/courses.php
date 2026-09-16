<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Podpisany link do materiału kursu (H05)
    |--------------------------------------------------------------------------
    |
    | Wydawany na trasie Z TOKENEM (GET /courses/{slug}), gdzie decyduje się
    | o widoczności — pobranie samo w sobie żadnej roli już nie czyta (uprawnienie
    | rozstrzygnięte przy wydaniu, nie przy pobraniu). TTL jest górnym pułapem
    | życia linku: `MaterialDownloadController` odrzuca link, którego `expires`
    | sięga dalej w przyszłość niż ta wartość od chwili żądania — nie tylko
    | link już przeterminowany (to pilnuje sama trasa `signed`).
    |
    */

    'material_link_ttl_seconds' => (int) env('NP_MATERIAL_LINK_TTL_SECONDS', 300),

];
