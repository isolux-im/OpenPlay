import { miniSwipeAction } from '../player/gestures';

describe('gestes du mini-lecteur', () => {
  it('glisser à gauche : suivant ; à droite : précédent', () => {
    expect(miniSwipeAction(-80, 5, -100, 0)).toBe('next');
    expect(miniSwipeAction(90, -10, 50, 0)).toBe('previous');
  });

  it('un glissement court mais rapide compte, un geste trop court non', () => {
    expect(miniSwipeAction(-25, 0, -900, 0)).toBe('next');
    expect(miniSwipeAction(-25, 0, -100, 0)).toBeNull();
    expect(miniSwipeAction(0, 0, 0, 0)).toBeNull();
  });

  it('glisser vers le haut ouvre le lecteur ; vers le bas, rien', () => {
    expect(miniSwipeAction(10, -60, 0, -100)).toBe('open');
    expect(miniSwipeAction(5, -20, 0, -800)).toBe('open');
    expect(miniSwipeAction(5, 80, 0, 900)).toBeNull();
  });

  it('le sens dominant l’emporte', () => {
    expect(miniSwipeAction(-70, -50, 0, 0)).toBe('next');
    expect(miniSwipeAction(-30, -70, 0, 0)).toBe('open');
  });
});
