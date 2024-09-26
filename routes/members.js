import express from 'express';
import Member from '../models/Members.js';
import Activity from '../models/Activity.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, email, cellphone, plan, activities, automaticRenewal, promotion } = req.body;

    const existingMember = await Member.findOne({ email });
    if (existingMember) {
      return res.status(400).json({ message: 'El miembro ya existe. No se puede crear un duplicado.' });
    }

    const activityIds = activities.map(id => id.toString());
    const activitiesData = await Activity.find({ '_id': { $in: activityIds } });

    // Imprimir actividades para verificar los datos
    

    // Separar actividades en musculación y clases
    const hasMusculacion = activitiesData.some(activity => activity.category === 'musculacion');
    const hasClass = activitiesData.some(activity => activity.category === 'class');



    let totalPriceActivities = 0;

    if (promotion) {
      // Si hay promoción, el precio es 19,000
      totalPriceActivities = 19000;
    } else if (hasMusculacion && hasClass) {
      // Si no hay promoción, pero el miembro selecciona musculación y al menos una clase
      totalPriceActivities = 19000;
    } else {
      // Si no hay promoción y solo musculación o solo clases
      totalPriceActivities = 17000;
    }

    // Imprimir el precio calculado
    console.log("Total Price Activities:", totalPriceActivities);

    const expirationDate = plan?.type === 'Mensual' ? 
      new Date(new Date(plan.initDate).setMonth(new Date(plan.initDate).getMonth() + 1)) :
      new Date(new Date(plan.initDate).setMonth(new Date(plan.initDate).getMonth() + 6));

    const newMember = new Member({
      name,
      email,
      cellphone,
      plan: {
        type: plan.type,
        promotion: promotion,
        price: totalPriceActivities,
        initDate: plan.initDate,
        expirationDate: expirationDate,
        lastRenewalDate: plan.initDate
      },
      activities: activityIds,
      automaticRenewal
    });

    await newMember.save();
    res.status(201).json(newMember);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Error al crear el socio', error });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, cellphone, plan, activities, automaticRenewal } = req.body;

    // Buscar miembro existente por ID
    const existingMember = await Member.findById(id);
    if (!existingMember) {
      return res.status(404).json({ message: 'El miembro con el ID proporcionado no existe.' });
    }

    // Validar si el nuevo email ya está en uso por otro miembro
    const emailTaken = await Member.findOne({ email, _id: { $ne: id } });
    if (emailTaken) {
      return res.status(400).json({ message: 'El correo electrónico ya está en uso por otro miembro.' });
    }

    // Verificar si se recibieron actividades
    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.status(422).json({ message: 'Debe seleccionar al menos una actividad.' });
    }

    // Obtener y procesar actividades
    const activityIds = activities.map(id => id.toString());
    const activitiesData = await Activity.find({ '_id': { $in: activityIds } });

    // Verificar si las actividades proporcionadas existen en la base de datos
    if (activitiesData.length !== activities.length) {
      return res.status(404).json({ message: 'Una o más actividades seleccionadas no existen.' });
    }

    const hasMusculacion = activitiesData.some(activity => activity.category === 'musculacion');
    const hasClass = activitiesData.some(activity => activity.category === 'class');

    // Determinar si se aplica promoción
    const promotion = hasMusculacion && hasClass;

    let totalPriceActivities = 0;

    // Calcular el precio basado en las actividades y la promoción
    if (promotion) {
      totalPriceActivities = 19000;  // Si hay promoción (musculación + clases)
    } else if (hasMusculacion || hasClass) {
      totalPriceActivities = 17000;  // Solo musculación o solo clases
    } else {
      return res.status(422).json({ message: 'Debe seleccionar al menos una actividad válida.' });
    }

    if (!plan?.initDate || isNaN(new Date(plan?.initDate))) {
      return res.status(422).json({ message: 'Fecha de inicio inválida.' });
    }
    
    const expirationDate = plan.type === 'Mensual' ? 
      new Date(new Date(plan.initDate).setMonth(new Date(plan.initDate).getMonth() + 1)) :
      new Date(new Date(plan.initDate).setMonth(new Date(plan.initDate).getMonth() + 6));
    
    // Actualizar los campos del miembro
    existingMember.name = name || existingMember.name;
    existingMember.email = email || existingMember.email;
    existingMember.cellphone = cellphone || existingMember.cellphone;
    existingMember.plan = {
      type: plan?.type || existingMember.plan.type,
      promotion: promotion,  // Promoción se deduce automáticamente
      price: totalPriceActivities,
      initDate: plan?.initDate || existingMember.plan.initDate,
      expirationDate: expirationDate || existingMember.plan.expirationDate,
      lastRenewalDate: plan?.initDate || existingMember.plan.lastRenewalDate
    };
    existingMember.activities = activityIds.length ? activityIds : existingMember.activities;
    existingMember.automaticRenewal = automaticRenewal !== undefined ? automaticRenewal : existingMember.automaticRenewal;

    // Guardar los cambios
    await existingMember.save();

    res.status(200).json(existingMember);
  } catch (error) {
    console.error('Error al actualizar el miembro:', error);

    // Identificar errores específicos
    if (error.name === 'ValidationError') {
      return res.status(422).json({ message: 'Error de validación en los datos proporcionados.', details: error.message });
    }

    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'ID de miembro inválido.' });
    }

    res.status(500).json({ message: 'Ocurrió un error interno en el servidor al actualizar el miembro.' });
  }
});





// Obtener todos los member
router.get('/', async (req, res) => {
  const { page = 1, limit = 10, searchTerm = '' } = req.query;
  const skip = (page - 1) * limit;
  const limitNumber = parseInt(limit);

  // Crear el filtro de búsqueda
  const searchQuery = searchTerm
    ? {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } }, // Búsqueda por nombre (case insensitive)
          { email: { $regex: searchTerm, $options: 'i' } }, // Búsqueda por email (case insensitive)
        ],
      }
    : {}; // Si no hay búsqueda, no se filtra nada

  try {
    // Buscar miembros con paginación y filtro
    const members = await Member.find(searchQuery)
      .skip(skip)
      .limit(limitNumber)
      .populate('activities');

    // Contar el total de miembros que coinciden con la búsqueda
    const total = await Member.countDocuments(searchQuery);

    res.status(200).json({ members, total });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener socios', error });
  }
});

// Renovar membresía de un socio
router.put('/:id/renew', async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ message: 'Socio no encontrado' });

    const currentDate = new Date();
    member.plan.lastRenewalDate = currentDate;

    const newExpiration = member.plan.type === 'Mensual' ?
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate()) :
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 6, currentDate.getDate());

    member.plan.expirationDate = newExpiration;

    await member.save();

    
    res.status(200).json(member);
  } catch (error) {
    res.status(500).json({ message: 'Error al renovar la membresía', error });
  }
});

router.get('/all', async (req,res) => {
  try {
    const members = await Member.find();
    res.status(200).json(members)
  } catch (error) {
    res.status(500).json({message: 'Error al obtener los miembros', error})
  }
})

export default router;
