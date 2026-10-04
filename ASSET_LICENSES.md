# Assets externos usados no FC Mukeka Premium

## Quaternius — Universal Base Characters

O build 3D em desenvolvimento usa como primeira opção um personagem humanoide derivado do pacote **Universal Base Characters**, de Quaternius.

- Licença do asset original: **CC0 1.0 Universal**
- Uso permitido: pessoal e comercial, modificação e redistribuição.
- Fonte oficial: https://quaternius.com/packs/universalbasecharacters.html
- Página itch.io: https://quaternius.itch.io/universal-base-characters

Durante o desenvolvimento no navegador, o arquivo GLB é carregado de um espelho público fixado por commit:
`Seyamalam/blood-league-kickoff/public/assets/vendor/quaternius/night-striker.glb`

O repositório que hospeda esse espelho documenta o arquivo como uma conversão do asset CC0 de Quaternius. Nenhum código desse projeto externo é importado pelo FC Mukeka Premium; apenas o asset 3D CC0 é carregado.

## Fallback

Se o rig acima não carregar, o build usa como fallback o personagem **Animated Men** de Quaternius já utilizado anteriormente, também documentado como CC0.

## Código e animações

As animações específicas de futebol do FC Mukeka Premium (passe, chute, cruzamento, cabeceio, carrinho, desarme, defesa e comemoração) são geradas em tempo de execução pelo próprio projeto sobre o esqueleto compatível.
