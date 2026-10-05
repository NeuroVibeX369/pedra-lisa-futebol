# Pedra Lisa Games — arquitetura inicial

A plataforma deve funcionar como um catálogo de jogos independentes sob uma identidade única.

## Primeiros jogos
- Pedra Lisa PS1 — futebol retrô/low-poly.
- Pedra Lisa PS2 — futebol 3D tradicional, inicialmente baseado nos testes com GoalKick/GameplayFootball.

## Próximos universos
- Duelo de Cartas — jogo original de cartas.
- RPG de Criaturas — captura, evolução e batalhas com personagens próprios.
- Mundo OpenTibia — servidor separado, integrado à plataforma.

## Regra de arquitetura
Cada jogo deve ter seu próprio código, assets, save e dependências. A plataforma raiz cuida apenas de catálogo, conta, perfil, amigos, ranking, conquistas e entrada para cada jogo.

Estrutura desejada:

```
/
  index.html
  games/
    futebol-ps1/
    futebol-ps2/
    cartas/
    criaturas/
    opentibia/
  platform/
    auth/
    profile/
    friends/
    rankings/
    achievements/
```

## Etapas
1. Validar Pedra Lisa PS1 e PS2 como jogos.
2. Padronizar controles, identidade visual e telas de entrada.
3. Criar conta única.
4. Adicionar amigos, ranking e conquistas.
5. Integrar jogos adicionais sem acoplá-los entre si.

## Direitos
Projetos de terceiros entram primeiro apenas como referências externas. Código ou assets de terceiros só devem ser incorporados quando a licença ou autorização permitir. Marcas e personagens licenciados de terceiros não devem ser usados publicamente sem autorização.
