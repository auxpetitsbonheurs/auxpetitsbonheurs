import type { GalleryPhoto } from '../domain/types'

const g = (id: number, art: string, occasion: string, en: string, fr: string): GalleryPhoto => ({
  id: `g${id}`, art, occasion, caption: { en, fr },
})

export const GALLERY: GalleryPhoto[] = [
  g(1, 'art:cake:0', 'birthday', 'Honey birthday cake', 'Gâteau d\'anniversaire au miel'),
  g(2, 'art:cake:1', 'birthday', 'Peach layer cake', 'Layer cake pêche'),
  g(3, 'art:cake:4', 'wedding', 'Soft butter-cream tiers', 'Étages crème au beurre'),
  g(4, 'art:cake:2', 'wedding', 'Mint and white', 'Menthe et blanc'),
  g(5, 'art:cupcake:0', 'celebration', 'Vanilla cupcakes', 'Cupcakes à la vanille'),
  g(6, 'art:cupcake:3', 'baby', 'Baby shower cupcakes', 'Cupcakes baby shower'),
  g(7, 'art:cake:3', 'baby', 'Lavender baby cake', 'Gâteau lavande'),
  g(8, 'art:macaron:0', 'celebration', 'Macaron gift box', 'Coffret de macarons'),
  g(9, 'art:cup:2', 'celebration', 'Dessert cups', 'Verrines'),
  g(10, 'art:cake:5', 'birthday', 'Sky blue birthday cake', 'Gâteau bleu ciel'),
  g(11, 'art:log:0', 'celebration', 'Yule log', 'Bûche de Noël'),
  g(12, 'art:cupcake:1', 'birthday', 'Peach cupcakes', 'Cupcakes pêche'),
]
export const OCCASIONS = ['birthday', 'wedding', 'baby', 'celebration'] as const
