const pepes = [
  "PepePrime",
  "PepeHands",
  "PepeScoot",
  "SadPepe",
  "SadPeepo",
  "SadFrog",
  "PepeTheToad",
  "PooPooPeePee",
  "HarryPepe",
  "SmugPepe",
  "ANGYPEPE",
  "NuuPepe",
  "RarePepe",
  "FeelsPepeMan",
  "LonelyPepe",
  "JesusPepe",
  "BeLikePepe",
  "ConnorMcPepe",
  "PepeHut",
  "NewYorkPepe",
  "LeagueOfPepe",
  "PepeCoin",
  "PepeCash",
  "OwO",
  "UwU",
  "PepeRacist",
  "PepeHate",
  "Pepe2020",
];

export function randomPepe() {
  return pepes[Math.floor(Math.random() * pepes.length)];
}