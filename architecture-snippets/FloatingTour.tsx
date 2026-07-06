import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/theme';
import { useTourStore } from '../store/useTourStore';
import { useRouter, usePathname } from 'expo-router';

const { width } = Dimensions.get('window');

export function FloatingTour() {
  const { isTourActive, currentStep, nextStep, endTour } = useTourStore();
  const router = useRouter();
  const pathname = usePathname();
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isTourActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -10, duration: 500, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 500, useNativeDriver: true })
        ])
      ).start();
    }
  }, [isTourActive]);

  useEffect(() => {
    if (isTourActive) {
      if (currentStep === 'BEM_VINDO' && pathname !== '/') {
        router.push('/');
      } else if (currentStep === 'ADICIONAR_REMEDIO' && pathname !== '/medications') {
        router.push('/medications');
      } else if (currentStep === 'VER_PERFIL' && pathname !== '/profiles') {
        router.push('/profiles');
      }
    }
  }, [isTourActive, currentStep, pathname]);

  if (!isTourActive) return null;

  const renderContent = () => {
    switch (currentStep) {
      case 'BEM_VINDO':
        return {
          title: "Passo 1: Bem-vindo!",
          desc: "Esta é sua tela Inicial. Aqui você verá os remédios do dia e o histórico. Vamos configurar um remédio?",
          action: () => { router.push('/medications'); nextStep(); },
          btn: "Ir para Farmácia"
        };
      case 'ADICIONAR_REMEDIO':
        return {
          title: "Passo 2: Farmácia",
          desc: "Aqui você cadastra e gerencia o estoque de remédios. Clique no botão '+ Adicionar' aqui embaixo para cadastrar um novo.",
          action: () => nextStep(),
          btn: "Entendi!"
        };
      case 'VER_PERFIL':
        return {
          title: "Passo 3: Pacientes e Prontuário",
          desc: "Nesta tela você gerencia os perfis (Avó, Pai) e visualiza a Ficha Médica de cada um. O botão de importação ajuda a receber dados via WhatsApp.",
          action: () => endTour(),
          btn: "Finalizar Tour"
        };
      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View style={[styles.tooltip, { transform: [{ translateY: bounceAnim }] }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{content.title}</Text>
          <TouchableOpacity onPress={endTour} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <MaterialIcons name="close" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.desc}>{content.desc}</Text>
        <TouchableOpacity style={styles.btn} onPress={content.action}>
          <Text style={styles.btnText}>{content.btn}</Text>
          <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70, // Fica no topo (abaixo do header da Home)
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    paddingHorizontal: 20
  },
  tooltip: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  title: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 18
  },
  desc: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 15
  },
  btn: {
    backgroundColor: '#FFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  btnText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 14
  }
});
