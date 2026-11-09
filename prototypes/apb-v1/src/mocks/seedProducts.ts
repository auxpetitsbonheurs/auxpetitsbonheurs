import type { OptionChoice, OptionGroup, OptionKind, Product } from '../domain/types'

const ch = (id: string, en: string, fr: string, price = 0): OptionChoice => ({ id, name: { en, fr }, price })
const grp = (
  id: string, en: string, fr: string, kind: OptionKind, required: boolean,
  choices: OptionChoice[] = [], extra: Partial<OptionGroup> = {},
): OptionGroup => ({ id, name: { en, fr }, kind, required, choices, ...extra })

const cakeGroups = (p: string, sizes: [string, string, number][], withBerries = true): OptionGroup[] => [
  grp(`${p}-size`, 'Size', 'Taille', 'one', true, sizes.map(([en, fr, price], i) => ch(`${p}-s${i}`, en, fr, price))),
  grp(`${p}-flavour`, 'Flavour', 'Parfum', 'one', true, [
    ch(`${p}-f0`, 'Vanilla', 'Vanille'),
    ch(`${p}-f1`, 'Chocolate', 'Chocolat'),
    ch(`${p}-f2`, 'Red velvet', 'Red velvet', 150),
  ]),
  grp(`${p}-addons`, 'Add-ons', 'Suppléments', 'several', false, [
    ...(withBerries ? [ch(`${p}-a0`, 'Fresh berries', 'Fruits rouges frais', 250)] : []),
    ch(`${p}-a1`, 'Gold leaf', 'Feuille d\'or', 300),
    ch(`${p}-a2`, 'Candles', 'Bougies', 50),
  ]),
  grp(`${p}-msg`, 'Message on cake', 'Message sur le gâteau', 'text', false, [], { charLimit: 40 }),
]

export function seedProducts(season: { start: string; end: string }): Product[] {
  return [
    {
      id: 'p-choc', type: 'cake', sort: 1, status: 'available', basePrice: 1800,
      name: { en: 'Chocolate Celebration Cake', fr: 'Gâteau chocolat festif' },
      desc: {
        en: 'Three layers of moist chocolate sponge with silky ganache. Our birthday favourite.',
        fr: 'Trois étages de génoise moelleuse au chocolat et ganache soyeuse. Notre favori des anniversaires.',
      },
      photos: ['art:cake:0', 'art:cake:3', 'art:cake:1'], allergens: ['gluten', 'egg', 'milk', 'soy'],
      groups: cakeGroups('choc', [['6 inch (8 slices)', '6 pouces (8 parts)', 0], ['8 inch (14 slices)', '8 pouces (14 parts)', 700], ['10 inch (24 slices)', '10 pouces (24 parts)', 1400]]),
    },
    {
      id: 'p-vanilla', type: 'cake', sort: 2, status: 'available', basePrice: 1600,
      name: { en: 'Eggless Vanilla Berry Cake', fr: 'Gâteau vanille-fruits rouges sans œufs' },
      desc: {
        en: 'Light eggless vanilla sponge, whipped cream and fresh berries.',
        fr: 'Génoise légère à la vanille sans œufs, crème fouettée et fruits rouges frais.',
      },
      photos: ['art:cake:4', 'art:cake:5'], allergens: ['gluten', 'milk'],
      groups: cakeGroups('van', [['6 inch (8 slices)', '6 pouces (8 parts)', 0], ['8 inch (14 slices)', '8 pouces (14 parts)', 600]]),
    },
    {
      id: 'p-tier', type: 'cake', sort: 3, status: 'available', basePrice: 6500, noticeDays: 5,
      name: { en: 'Two-Tier Celebration Cake', fr: 'Gâteau festif à deux étages' },
      desc: {
        en: 'A statement cake for weddings and big parties. Needs 5 days notice.',
        fr: 'Un gâteau d\'exception pour mariages et grandes fêtes. Prévoir 5 jours de préavis.',
      },
      photos: ['art:cake:2', 'art:cake:4'], allergens: ['gluten', 'egg', 'milk', 'nuts'],
      groups: [
        grp('tier-size', 'Size', 'Taille', 'one', true, [ch('tier-s0', 'Serves 30', '30 personnes'), ch('tier-s1', 'Serves 50', '50 personnes', 3000)]),
        grp('tier-msg', 'Message on cake', 'Message sur le gâteau', 'text', false, [], { charLimit: 40 }),
      ],
    },
    {
      id: 'p-cupcake', type: 'cupcake', sort: 4, status: 'available', basePrice: 600,
      name: { en: 'Cupcake Box', fr: 'Boîte de cupcakes' },
      desc: {
        en: 'Fluffy cupcakes with swirls of buttercream, boxed and ready to gift.',
        fr: 'Cupcakes moelleux et crème au beurre, en boîte cadeau.',
      },
      photos: ['art:cupcake:0', 'art:cupcake:1', 'art:cupcake:3'], allergens: ['gluten', 'egg', 'milk'],
      groups: [
        grp('cup-size', 'Box size', 'Taille de la boîte', 'one', true, [ch('cup-s0', 'Box of 6', 'Boîte de 6'), ch('cup-s1', 'Box of 12', 'Boîte de 12', 550)]),
        grp('cup-flavour', 'Flavours', 'Parfums', 'several', true, [
          ch('cup-f0', 'Vanilla', 'Vanille'), ch('cup-f1', 'Chocolate', 'Chocolat'),
          ch('cup-f2', 'Lemon', 'Citron'), ch('cup-f3', 'Strawberry', 'Fraise'),
        ]),
      ],
    },
    {
      id: 'p-mousse', type: 'dessert', sort: 5, status: 'available', basePrice: 110,
      name: { en: 'Dessert Cups (each)', fr: 'Verrines (à l\'unité)' },
      desc: {
        en: 'Individual dessert cups, perfect for parties. Minimum 6, maximum 48.',
        fr: 'Verrines individuelles, parfaites pour les réceptions. De 6 à 48.',
      },
      photos: ['art:cup:0', 'art:cup:2'], allergens: ['milk', 'soy'],
      groups: [
        grp('mou-flavour', 'Flavour', 'Parfum', 'one', true, [
          ch('mou-f0', 'Chocolate mousse', 'Mousse au chocolat'), ch('mou-f1', 'Panna cotta', 'Panna cotta'),
          ch('mou-f2', 'Mango passion', 'Mangue passion', 20),
        ]),
        grp('mou-qty', 'Number of cups', 'Nombre de verrines', 'quantity', true, [], { qtyMin: 6, qtyMax: 48 }),
      ],
    },
    {
      id: 'p-yule', type: 'seasonal', sort: 6, status: 'available', basePrice: 2200,
      seasonStart: season.start, seasonEnd: season.end,
      name: { en: 'Christmas Yule Log', fr: 'Bûche de Noël' },
      desc: {
        en: 'Chocolate and chestnut-free yule log with meringue mushrooms. Seasonal.',
        fr: 'Bûche au chocolat avec champignons en meringue. Édition de saison.',
      },
      photos: ['art:log:0', 'art:log:1'], allergens: ['gluten', 'egg', 'milk'],
      groups: [
        grp('yule-size', 'Size', 'Taille', 'one', true, [ch('yule-s0', 'Serves 6', '6 personnes'), ch('yule-s1', 'Serves 10', '10 personnes', 900)]),
      ],
    },
    {
      id: 'p-loaf', type: 'dessert', sort: 7, status: 'soldout', basePrice: 650,
      name: { en: 'Lemon Drizzle Loaf', fr: 'Cake au citron glacé' },
      desc: { en: 'Zesty lemon loaf with a sugar glaze.', fr: 'Cake au citron avec glaçage sucré.' },
      photos: ['art:cake:1'], allergens: ['gluten', 'egg', 'milk'], groups: [],
    },
    {
      id: 'p-macaron', type: 'dessert', sort: 8, status: 'available', basePrice: 900,
      name: { en: 'Macaron Gift Box', fr: 'Coffret de macarons' },
      desc: { en: 'Assorted pastel macarons in a gift box.', fr: 'Assortiment de macarons pastel en coffret.' },
      photos: ['art:macaron:0', 'art:macaron:2'], allergens: ['egg', 'milk', 'nuts'],
      groups: [
        grp('mac-size', 'Box size', 'Taille du coffret', 'one', true, [ch('mac-s0', '12 macarons', '12 macarons'), ch('mac-s1', '24 macarons', '24 macarons', 800)]),
      ],
    },
  ]
}
