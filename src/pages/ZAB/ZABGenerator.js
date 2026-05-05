export class ZABGeneratorEngine {
    constructor() {
      this.val = {
        '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
        'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18,
        'J': 19, 'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24, 'P': 25, 'Q': 26, 'R': 27,
        'S': 28, 'T': 29, 'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34, 'Z': 35
      }
      
      this.revval = {
        0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
        10: 'A', 11: 'B', 12: 'C', 13: 'D', 14: 'E', 15: 'F', 16: 'G', 17: 'H', 18: 'I',
        19: 'J', 20: 'K', 21: 'L', 22: 'M', 23: 'N', 24: 'O', 25: 'P', 26: 'Q', 27: 'R',
        28: 'S', 29: 'T', 30: 'U', 31: 'V', 32: 'W', 33: 'X', 34: 'Y', 35: 'Z'
      }
      
      this.weight = {
        1: 5, 2: 7, 3: 11, 4: 13, 5: 17, 6: 19, 7: 23, 8: 29, 9: 31
      }
  
      this.BACKEND_URL = 'https://script.google.com/macros/s/AKfycbzEyZ6Q8aMtHpVRWRUQ5LL2X9IFl0fJKYNdS0LEt52CmSpEvqt_zqfFTjTPrSqU7JeFyw/exec'
    }
  
    validateZabFormat(zab) {
      const regex = /^ZAB\d{6}[0-9A-Z]$/
      return regex.test(zab)
    }
  
    extractCounterFromZab(zab) {
      return parseInt(zab.substring(3, 9))
    }
  
    calculateCheckDigit(sn) {
      const snDigits = sn.split('')
      let addend = 0
      
      for (let i = 0; i < 9; i++) {
        const digit = snDigits[i]
        const weight = this.weight[i + 1]
        const value = this.val[digit]
        addend += value * weight
      }
      
      const chkdigit = addend % 36
      return this.revval[chkdigit]
    }
  
    generateCodes(startCounter, quantity) {
      const codes = []
      let counter = startCounter
      
      for (let i = 0; i < quantity; i++) {
        const sn = 'ZAB' + counter.toString().padStart(6, '0')
        const checkDigit = this.calculateCheckDigit(sn)
        const finalCode = sn + checkDigit
        codes.push({ code: finalCode, sn, checkDigit, counter })
        counter++
      }
      
      return { codes, lastCounter: counter - 1 }
    }
  
    async saveToBackend(codes) {
      try {
        const response = await fetch(this.BACKEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            codes: codes.map(c => c.code),
            action: 'saveCodes'
          })
        })
        
        if (!response.ok) throw new Error('Error del backend')
        
        const result = await response.json()
        return result
      } catch (error) {
        console.error('Error guardando en backend:', error)
        throw error
      }
    }
  
    async getLastCounter() {
      try {
        const response = await fetch(this.BACKEND_URL, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })
        
        if (!response.ok) throw new Error('Error del backend')
        
        const data = await response.json()
        return data.lastCounter || 300000
      } catch (error) {
        console.error('Error obteniendo contador:', error)
        return 300000
      }
    }
  }