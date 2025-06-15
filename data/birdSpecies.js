const birdSpecies = {
  "American Robin": "Turdus migratorius",
  "Blue Jay": "Cyanocitta cristata",
  "Cardinal": "Cardinalis cardinalis",
  "Chickadee": "Poecile atricapillus",
  "Crow": "Corvus brachyrhynchos",
  "Dove": "Columbidae",
  "Eagle": "Haliaeetus leucocephalus",
  "Finch": "Haemorhous mexicanus",
  "Goldfinch": "Spinus tristis",
  "Hawk": "Buteo jamaicensis",
  "Hummingbird": "Trochilidae",
  "Mockingbird": "Mimus polyglottos",
  "Owl": "Strigiformes",
  "Parrot": "Psittaciformes",
  "Pelican": "Pelecanus",
  "Penguin": "Spheniscidae",
  "Pigeon": "Columba livia",
  "Sparrow": "Passer domesticus",
  "Starling": "Sturnus vulgaris",
  "Woodpecker": "Picidae",
  // Add more birds as needed
};

// Function to find matching birds
const findMatchingBirds = (query) => {
  const normalizedQuery = query.toLowerCase();
  return Object.entries(birdSpecies)
    .filter(([name]) => name.toLowerCase().includes(normalizedQuery))
    .map(([name, species]) => ({ name, species }));
};

module.exports = {
  birdSpecies,
  findMatchingBirds
}; 