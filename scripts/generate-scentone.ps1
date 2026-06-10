# Generate Scentone T100 flavor entries
# Systematic evaluation per the user's framework

$script:flavors = @()

function Add-Flavor($id, $emoji, $label, $family, $subgroup, $bigCat, $bigSub, $sour, $sweet, $bitter, $salty, $umami, $desc) {
    $script:flavors += [PSCustomObject]@{
        id = "scentone_$id"
        emoji = $emoji
        label = $label
        family = $family
        subgroup = $subgroup
        bigCategory = $bigCat
        bigSubgroup = $bigSub
        taste = @{ sour = $sour; sweet = $sweet; bitter = $bitter; salty = $salty; umami = $umami }
        description = $desc
        wcr_ref = $false
        wcr_category = "Scentone T100"
    }
}

# ═══════════════════════════════════════════════
# TROPICAL FRUIT — enzymatic → tropical-fruit
# ═══════════════════════════════════════════════
Add-Flavor "guava" "🫒" "Guava" "fruity" "tropical" "enzymatic" "tropical-fruit" 2 2 0 0 0 "A sweet-tart tropical fruit with floral and grassy notes, balancing acidity and mild sweetness."
Add-Flavor "mangosteen" "🫐" "Mangosteen" "fruity" "tropical" "enzymatic" "tropical-fruit" 1 3 0 0 0 "A delicate sweet-tart tropical fruit with a soft, juicy, and slightly floral profile."
Add-Flavor "mango" "🥭" "Mango" "fruity" "tropical" "enzymatic" "tropical-fruit" 1 4 0 0 0 "A rich sweet tropical fruit with a distinctive aromatic, honeyed, and luscious flesh."
Add-Flavor "banana" "🍌" "Banana" "fruity" "tropical" "enzymatic" "tropical-fruit" 0 4 0 0 1 "A creamy sweet tropical fruit with a soft, mellow, and slightly starchy character."
Add-Flavor "passionfruit" "🍈" "Passionfruit" "fruity" "tropical" "enzymatic" "tropical-fruit" 4 2 0 0 0 "A sharply tart and intensely aromatic tropical fruit with bright acidity and floral notes."
Add-Flavor "watermelon" "🍉" "Watermelon" "fruity" "tropical" "enzymatic" "tropical-fruit" 0 3 0 0 0 "A light, subtly sweet and refreshingly watery melon with a mild, clean finish."
Add-Flavor "papaya" "🥝" "Papaya" "fruity" "tropical" "enzymatic" "tropical-fruit" 0 3 0 0 1 "A soft sweet tropical fruit with a musky, creamy character and gentle earthy undertones."
Add-Flavor "tropical-fruit" "🍍" "Tropical Fruit" "fruity" "tropical" "enzymatic" "tropical-fruit" 1 3 0 0 0 "A complex blend of sweet and tangy tropical notes, evocative of mixed exotic fruits."
Add-Flavor "melon" "🍈" "Melon" "fruity" "tropical" "enzymatic" "tropical-fruit" 0 3 0 0 0 "A mildly sweet, honeyed melon with a soft, juicy, and subtly floral aroma."
Add-Flavor "lychee" "🍑" "Lychee" "fruity" "tropical" "enzymatic" "tropical-fruit" 1 4 0 0 0 "A perfumed sweet tropical fruit with floral, rose-like notes and a delicate juicy texture."
Add-Flavor "aloe" "🌱" "Aloe" "fruity" "tropical" "enzymatic" "tropical-fruit" 0 1 1 0 0 "A mild, watery, and slightly bitter green note with a light vegetal freshness."

# ═══════════════════════════════════════════════
# BERRY — enzymatic → berry-like
# ═══════════════════════════════════════════════
Add-Flavor "acerola" "🍒" "Acerola" "fruity" "berry" "enzymatic" "berry-like" 5 1 0 0 0 "An intensely tart cherry-like berry with extreme acidity and a very bright, sharp finish."
Add-Flavor "blackcurrant" "🫐" "Blackcurrant" "fruity" "berry" "enzymatic" "berry-like" 3 2 0 0 0 "A bold, tart dark berry with tangy acidity, slight sweetness, and a deep fruit-forward character."

# ═══════════════════════════════════════════════
# CITRUS & OTHER FRUIT — enzymatic → citrus-other-fruit
# ═══════════════════════════════════════════════
Add-Flavor "muscat" "🍇" "Muscat" "fruity" "citrus" "enzymatic" "citrus-other-fruit" 1 4 0 0 0 "A sweet, floral wine grape with honeyed richness and a perfumed, luscious character."
Add-Flavor "citron" "🍋" "Citron" "fruity" "citrus" "enzymatic" "citrus-other-fruit" 4 1 2 0 0 "A sharp, intensely aromatic citrus with high acidity, pronounced bitterness, and bright zest."
Add-Flavor "chinese-quince" "🍐" "Chinese Quince" "fruity" "citrus" "enzymatic" "citrus-other-fruit" 3 1 2 0 0 "A tart, astringent fruit with woody undertones, firm acidity, and a dry, firm finish."

# ═══════════════════════════════════════════════
# STONE FRUIT — enzymatic → stone-fruit
# ═══════════════════════════════════════════════
Add-Flavor "plum" "🍑" "Plum" "fruity" "stone-fruit" "enzymatic" "stone-fruit" 2 3 0 0 0 "A sweet-tart stone fruit with dark, juicy flesh and a balanced acidity level."
Add-Flavor "apricot" "🍊" "Apricot" "fruity" "stone-fruit" "enzymatic" "stone-fruit" 1 4 0 0 0 "A soft sweet stone fruit with delicate floral undertones and a velvety, round character."
Add-Flavor "jujube" "🫘" "Jujube" "fruity" "stone-fruit" "enzymatic" "stone-fruit" 0 4 0 0 0 "A sweet date-like fruit with mild honeyed richness and a chewy, concentrated texture."

# ═══════════════════════════════════════════════
# CEREAL & NUT — sugar-browning → cereal-nut
# ═══════════════════════════════════════════════
Add-Flavor "walnut" "🥜" "Walnut" "nutty" "" "sugar-browning" "cereal-nut" 0 1 2 0 0 "A nutty, slightly bitter kernel with oily richness and a dry, astringent finish."
Add-Flavor "pine-nut" "🌰" "Pine Nut" "nutty" "" "sugar-browning" "cereal-nut" 0 1 1 0 1 "A buttery, mild nut with a soft resinous undertone and a subtle savory edge."
Add-Flavor "pistachio" "🟢" "Pistachio Nut" "nutty" "" "sugar-browning" "cereal-nut" 0 2 0 1 0 "A sweet nut with a distinctive green hue, light saltiness, and a delicate creamy texture."
Add-Flavor "sesame" "🫘" "Sesame" "nutty" "" "sugar-browning" "cereal-nut" 0 1 1 0 1 "A nutty, toasty seed with a warm oily character and subtle umami depth."
Add-Flavor "red-bean" "🫘" "Red Bean" "cereal" "" "sugar-browning" "cereal-nut" 0 3 0 0 0 "A sweet, earthy legume with a soft starchy texture and mild nutty undertones."
Add-Flavor "scorched-rice" "🍚" "Scorched Rice" "cereal" "" "sugar-browning" "cereal-nut" 0 1 2 0 0 "A toasty, nutty grain with a slightly bitter charred edge and warm cereal aroma."

# ═══════════════════════════════════════════════
# CARAMEL & CHOCOLATE — sugar-browning → caramel-chocolate
# ═══════════════════════════════════════════════
Add-Flavor "mocha" "☕" "Mocha" "cocoa" "" "sugar-browning" "caramel-chocolate" 0 2 2 0 0 "A rich chocolate-coffee blend with deep roasted notes, balanced sweetness, and mild bitterness."
Add-Flavor "vanilla" "🍦" "Vanilla" "sweet" "" "sugar-browning" "caramel-chocolate" 0 3 0 0 0 "A sweet, creamy aromatic with warm, smooth, and delicately floral qualities."

# ═══════════════════════════════════════════════
# HERB & FLOWER — enzymatic → herb-flowery
# ═══════════════════════════════════════════════
Add-Flavor "hawthorn" "🌿" "Hawthorn" "floral" "" "enzymatic" "herb-flowery" 1 2 1 0 0 "A mildly tart, floral berry-like note with a soft herbal backdrop and gentle sweetness."
Add-Flavor "basil" "🌿" "Basil" "spice" "" "enzymatic" "herb-flowery" 0 1 1 0 0 "A sweet aromatic herb with peppery, slightly anise-like notes and a fresh green character."
Add-Flavor "thyme" "🌿" "Thyme" "spice" "" "enzymatic" "herb-flowery" 0 0 2 0 1 "An earthy, slightly pungent herb with woody undertones and a warming savory aroma."
Add-Flavor "earl-grey" "🫖" "Earl Grey" "floral" "" "enzymatic" "herb-flowery" 1 1 1 0 0 "A floral black tea with distinctive bergamot citrus notes, mildly astringent and aromatic."
Add-Flavor "acacia" "🌸" "Acacia" "floral" "" "enzymatic" "herb-flowery" 0 3 0 0 0 "A sweet, honey-like floral with a delicate, soft, and gently perfumed character."
Add-Flavor "elderflower" "🌼" "Elderflower" "floral" "" "enzymatic" "herb-flowery" 1 3 0 0 0 "A sweet floral with delicate sour undertones, light honeyed character and perfumed elegance."
Add-Flavor "chrysanthemum" "🌼" "Chrysanthemum" "floral" "" "enzymatic" "herb-flowery" 0 1 2 0 0 "A floral herbal note with mild sweetness, distinct bitterness, and a tea-like finish."
Add-Flavor "hibiscus" "🌺" "Hibiscus" "floral" "" "enzymatic" "herb-flowery" 3 1 0 0 0 "A tart, vibrant floral with deep crimson color, cranberry-like acidity, and subtle sweetness."
Add-Flavor "eucalyptus" "🌲" "Eucalyptus" "other" "" "enzymatic" "herb-flowery" 0 0 2 0 0 "A cool, penetrating, medicinal note with a sharp, refreshing, and camphoraceous character."

# ═══════════════════════════════════════════════
# CITRUS (bergamot) — enzymatic → citrus-other-fruit
# ═══════════════════════════════════════════════
Add-Flavor "bergamot" "🍊" "Bergamot" "fruity" "citrus" "enzymatic" "citrus-other-fruit" 2 2 1 0 0 "An aromatic citrus with floral sweetness, gentle acidity, and a distinctive perfumed zest."

# ═══════════════════════════════════════════════
# SPICE — dry-distillation → spice-others
# ═══════════════════════════════════════════════
Add-Flavor "cardamom" "🫚" "Cardamom" "spice" "" "dry-distillation" "spice-others" 0 1 1 0 0 "A warm aromatic spice with sweet-citrusy undertones, slightly camphoraceous and complex."
Add-Flavor "cumin" "🟤" "Cumin" "spice" "" "dry-distillation" "spice-others" 0 0 2 1 0 "An earthy, warm spice with a distinctly savory character, slight bitterness, and salty edge."
Add-Flavor "black-pepper" "⚫" "Black Pepper" "spice" "" "dry-distillation" "spice-others" 0 0 1 0 0 "A pungent, sharp spice with a hot, penetrating bite and woody aromatic notes."

# ═══════════════════════════════════════════════
# VEGETABLE — other → vegetables
# ═══════════════════════════════════════════════
Add-Flavor "garlic" "🧄" "Garlic" "burnt-tobacco-green" "" "other" "vegetables" 0 0 0 0 1 "A pungent, savory allium with a strong, penetrating aroma and umami-rich character."
Add-Flavor "ginger" "🫚" "Ginger" "spice" "" "other" "vegetables" 0 1 1 0 0 "A sharp, spicy root with a warm, pungent kick, slight sweetness, and citrusy undertones."
Add-Flavor "pumpkin" "🎃" "Pumpkin" "burnt-tobacco-green" "" "other" "vegetables" 0 2 0 0 0 "A sweet, earthy gourd with a soft vegetal character and mild, comforting warmth."
Add-Flavor "tomato" "🍅" "Tomato" "burnt-tobacco-green" "" "other" "vegetables" 2 1 0 0 1 "A tangy, slightly sweet fruit-vegetable with bright acidity, umami depth, and fresh green notes."
Add-Flavor "mushroom" "🍄" "Mushroom" "burnt-tobacco-green" "" "other" "vegetables" 0 0 0 0 3 "An earthy, deeply savory fungus with rich umami flavor and a soft, woody aroma."
Add-Flavor "taro" "🫓" "Taro" "cereal" "" "other" "vegetables" 0 2 0 0 0 "A starchy, sweet root vegetable with a mild nutty character and creamy, earthy undertones."
Add-Flavor "kudzu" "🌿" "Kudzu" "other" "" "other" "vegetables" 0 1 0 0 0 "A starchy, mildly sweet root with a neutral, subtle earthy character and smooth texture."
Add-Flavor "ginseng" "🌿" "Ginseng" "other" "" "other" "vegetables" 0 1 3 0 0 "An earthy, medicinal root with pronounced bitterness, slight sweetness, and a woody depth."

# ═══════════════════════════════════════════════
# SAVORY — other → savory
# ═══════════════════════════════════════════════
Add-Flavor "soy-sauce" "🫗" "Soy Sauce" "other" "" "other" "savory" 0 0 0 4 3 "A deeply savory, salty condiment with rich umami intensity and a complex fermented character."
Add-Flavor "mustard" "🟡" "Mustard" "spice" "" "other" "savory" 1 0 1 1 0 "A sharp, pungent condiment with a hot, sinus-clearing bite, mild acidity, and salty edge."
Add-Flavor "mayonnaise" "🥚" "Mayonnaise" "other" "" "other" "savory" 1 0 0 1 0 "A creamy, tangy emulsion with rich mouthfeel, mild acidity, and a subtle savory depth."

# ═══════════════════════════════════════════════
# VEGETABLE (paprika) — other → vegetables
# ═══════════════════════════════════════════════
Add-Flavor "paprika" "🫑" "Paprika" "spice" "" "other" "vegetables" 0 1 0 0 0 "A mild sweet pepper with a gentle vegetal sweetness and warm, subtly earthy character."

# ═══════════════════════════════════════════════
# OTHERS — other → others-other
# ═══════════════════════════════════════════════
Add-Flavor "yogurt" "🥛" "Yogurt" "sour-fermented" "" "other" "others-other" 2 1 0 0 0 "A tangy, creamy fermented dairy with bright acidity, mild sweetness, and smooth body."
Add-Flavor "cheddar-cheese" "🧀" "Cheddar Cheese" "other" "" "other" "others-other" 0 0 0 2 2 "A sharp, savory cheese with salty intensity, rich umami, and a creamy, tangy profile."
Add-Flavor "musk" "🫎" "Musk" "other" "" "other" "others-other" 0 0 0 0 0 "A warm, animalic, deeply resonant aroma with a rich, enveloping, and primal character."
Add-Flavor "amber" "🟠" "Amber" "other" "" "other" "others-other" 0 2 0 0 0 "A warm, resinous, sweet note with a rich, honeyed depth and a soft, balsamic warmth."
Add-Flavor "smoke" "💨" "Smoke" "roasted-smoke" "" "other" "others-other" 0 0 3 0 0 "An intense, charred, smoky aroma with a dry, ashy edge and a deeply roasted character."
Add-Flavor "savory-beef" "🥩" "Savory Beef" "other" "" "other" "others-other" 0 0 0 1 3 "A rich, meaty, umami-packed savory note with roasted depth, saltiness, and hearty complexity."

# ═══════════════════════════════════════════════
# DAIRY — other → others-other (already added above for yogurt/cheddar)
# ═══════════════════════════════════════════════

# Output as JSON
$script:flavors | ConvertTo-Json -Depth 3 | Out-File -FilePath "src/sensory-memo/flavors-scentone.json" -Encoding utf8

Write-Host "Generated $($script:flavors.Count) Scentone T100 flavor entries"
Write-Host "Saved to src/sensory-memo/flavors-scentone.json"
